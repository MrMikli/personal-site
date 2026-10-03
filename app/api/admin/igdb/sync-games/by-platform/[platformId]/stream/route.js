import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { igdbRequest } from '@/lib/igdb';
import { buildGameCountBody, buildGameQuery } from '@/lib/igdbGames';
import { clearPlatformGames, syncIgdbGamePage } from '@/lib/igdbSync';

export const runtime = 'nodejs';
export const maxDuration = 300;

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Streams one chunk of a platform sync as server-sent events.
 * ?clear=true removes the platform's games; otherwise one or more IGDB pages starting at ?offset are
 * imported, and the final 'done' event tells the client whether to request the next offset.
 */
export async function GET(req, { params }) {
  const session = await getSession();
  const platformId = params?.platformId;

  const url = new URL(req.url);
  const clearFirst = url.searchParams.get('clear') === 'true';

  const offset = Math.max(0, parsePositiveInt(url.searchParams.get('offset'), 0));
  const pageSize = Math.min(500, Math.max(25, parsePositiveInt(url.searchParams.get('pageSize'), 200)));
  const maxPages = Math.min(5, Math.max(1, parsePositiveInt(url.searchParams.get('maxPages'), 1)));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event, data) {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      if (!session?.user?.isAdmin) {
        const isMaskedAdmin = !!session?.user?.isAdminActual && !!session?.user?.isAdminMasked;
        send('sync-error', {
          message: isMaskedAdmin
            ? 'Admin is currently masked (viewing as non-admin). Disable "view as non-admin" to run sync.'
            : 'Unauthorized'
        });
        controller.close();
        return;
      }

      if (!platformId || typeof platformId !== 'string') {
        send('sync-error', { message: 'Invalid platform ID' });
        controller.close();
        return;
      }

      try {
        const platform = await prisma.platform.findUnique({
          where: { id: platformId },
          select: {
            id: true,
            name: true,
            igdbId: true,
            yearStart: true,
            yearEnd: true,
            parentPlatform: { select: { igdbId: true } }
          }
        });

        if (!platform) {
          send('sync-error', { message: 'Platform not found' });
          controller.close();
          return;
        }

        const sourceIgdbId = platform.igdbId ?? platform.parentPlatform?.igdbId ?? null;
        if (!sourceIgdbId) {
          send('sync-error', {
            message:
              'This platform has no IGDB ID (and no parent platform with an IGDB ID), so it cannot be synced from IGDB.'
          });
          controller.close();
          return;
        }

        if (clearFirst) {
          const cleared = await clearPlatformGames(platform.id);
          const clear = {
            processed: cleared.deleted + cleared.disconnected + cleared.skipped,
            disconnected: cleared.disconnected,
            deleted: cleared.deleted,
            skipped: cleared.skipped,
            nextCursor: null,
            done: true
          };
          send('clear-done', clear);
          send('done', { phase: 'clear', clear });
          controller.close();
          return;
        }

        const yearStart = platform.yearStart ?? undefined;
        const yearEnd = platform.yearEnd ?? undefined;

        // Total is only for UI progress, so ask IGDB once (on the first chunk) and never fail on it.
        let totalCount = null;
        if (offset === 0) {
          const countWhere = buildGameCountBody({ platformIgdbId: sourceIgdbId, yearStart, yearEnd });
          try {
            const countRes = await igdbRequest('games/count', countWhere);
            if (Array.isArray(countRes) && countRes[0]?.count != null) totalCount = countRes[0].count;
            else if (typeof countRes?.count === 'number') totalCount = countRes.count;
            else if (typeof countRes === 'number') totalCount = countRes;
          } catch {}
          if (totalCount != null) send('total', { total: totalCount });
        }

        const target = { platformId: platform.id, platformIgdbId: sourceIgdbId, yearStart, yearEnd };

        let processed = 0;
        let inserted = 0;
        let updated = 0;
        let page = 0;

        let localOffset = offset;
        let lastBatchCount = 0;

        while (page < maxPages) {
          // IGDB allows 4 requests per second.
          if (page > 0) await new Promise((resolve) => setTimeout(resolve, 300));
          page += 1;
          const body = buildGameQuery({
            platformIgdbId: sourceIgdbId,
            limit: pageSize,
            offset: localOffset,
            yearStart,
            yearEnd
          });
          const games = await igdbRequest('games', body);
          if (!Array.isArray(games) || games.length === 0) {
            lastBatchCount = 0;
            break;
          }

          lastBatchCount = games.length;

          const written = await syncIgdbGamePage(games, { platformsFor: () => [target] });
          processed += games.length;
          inserted += written.inserted;
          updated += written.updated;

          send('progress', {
            page,
            processed,
            inserted,
            updated,
            pageCount: games.length,
            total: totalCount,
            offset: localOffset,
            pageSize
          });

          if (games.length < pageSize) break;
          localOffset += pageSize;
          if (localOffset > 20000) break;
        }

        const hasMore = lastBatchCount === pageSize && localOffset <= 20000;
        const nextOffset = hasMore ? localOffset : null;

        send('done', {
          phase: 'sync',
          processed,
          inserted,
          updated,
          hasMore,
          nextOffset,
          offset,
          pageSize,
          maxPages,
          total: totalCount
        });
        controller.close();
      } catch (err) {
        console.error('IGDB sync stream error', err);
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
