import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { igdbRequest } from '@/lib/igdb';
import { buildGamesByIdQuery } from '@/lib/igdbGames';
import { syncIgdbGamePage } from '@/lib/igdbSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Reads a query parameter as a whole number >= 0.
 * A missing or empty parameter gives the fallback (Number(null) would otherwise read as 0).
 */
function parseNonNegativeInt(value, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/**
 * Re-fetches games that are already in the database from IGDB by id and rewrites their columns.
 * Unlike the per-platform sync it never adds or removes games, so it is the cheap way to fill new columns.
 * Keyset pagination: one request handles one page, and the client follows nextCursor (the last igdbId
 * handled) until hasMore is false. Unlike an offset, a cursor stays correct if rows change between requests.
 */
export async function GET(req) {
  const session = await getSession();

  const url = new URL(req.url);
  const cursor = parseNonNegativeInt(url.searchParams.get('cursor'), 0);
  const pageSize = Math.min(500, Math.max(25, parseNonNegativeInt(url.searchParams.get('pageSize'), 500)));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event, data) {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      if (!session?.user?.isAdmin) {
        send('sync-error', { message: 'Unauthorized' });
        controller.close();
        return;
      }

      try {
        // The total only feeds the progress display, so it is counted once on the first page.
        const total = cursor === 0 ? await prisma.game.count() : null;
        if (total != null) send('total', { total });

        const stored = await prisma.game.findMany({
          where: { igdbId: { gt: cursor } },
          orderBy: { igdbId: 'asc' },
          take: pageSize,
          select: {
            igdbId: true,
            platforms: {
              select: {
                id: true,
                igdbId: true,
                yearStart: true,
                yearEnd: true,
                parentPlatform: { select: { igdbId: true } }
              }
            }
          }
        });

        if (stored.length === 0) {
          send('done', { phase: 'backfill', processed: 0, updated: 0, missing: 0, hasMore: false, nextCursor: null, total });
          controller.close();
          return;
        }

        // Platform variants have no IGDB id of their own and read release dates through their parent's.
        const platformsByIgdbId = new Map(
          stored.map((g) => [
            g.igdbId,
            g.platforms
              .map((p) => ({
                platformId: p.id,
                platformIgdbId: p.igdbId ?? p.parentPlatform?.igdbId ?? null,
                yearStart: p.yearStart ?? undefined,
                yearEnd: p.yearEnd ?? undefined
              }))
              .filter((p) => p.platformIgdbId != null)
          ])
        );

        const igdbIds = stored.map((g) => g.igdbId);
        const games = await igdbRequest('games', buildGamesByIdQuery(igdbIds));
        const found = Array.isArray(games) ? games : [];

        const written = await syncIgdbGamePage(found, {
          platformsFor: (g) => platformsByIgdbId.get(g.id) ?? []
        });

        const hasMore = stored.length === pageSize;
        send('done', {
          phase: 'backfill',
          processed: stored.length,
          updated: written.processed,
          // In our database but no longer returned by IGDB (deleted or merged there). Left untouched.
          missing: stored.length - written.processed,
          hasMore,
          nextCursor: hasMore ? igdbIds[igdbIds.length - 1] : null,
          total
        });
        controller.close();
      } catch (err) {
        console.error('IGDB backfill stream error', err);
        send('sync-error', { message: err?.message ? String(err.message) : String(err), retryable: true });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive'
    }
  });
}
