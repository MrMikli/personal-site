import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { igdbRequest } from '@/lib/igdb';
import {
  buildGameCountBody,
  buildGameQuery,
  pickEarliestRelease,
  toCoverBigUrl,
  hasWesternRelease,
} from '@/lib/igdbGames';

export const runtime = 'nodejs';
// Sync can take a while on large platforms; Vercel will still cap this based on your plan.
export const maxDuration = 300;

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export async function GET(req, { params }) {
  const session = await getSession();
  const platformIgdbId = Number(params?.platformIgdbId);

  const url = new URL(req.url);
  const clearFirst = url.searchParams.get('clear') === 'true';

  // Chunk controls (for Vercel Hobby timeouts)
  const offset = Math.max(0, parsePositiveInt(url.searchParams.get('offset'), 0));
  const pageSize = Math.min(500, Math.max(25, parsePositiveInt(url.searchParams.get('pageSize'), 200)));
  const maxPages = Math.min(5, Math.max(1, parsePositiveInt(url.searchParams.get('maxPages'), 1)));

  const clearCursor = url.searchParams.get('clearCursor') || null;
  const clearBatchSize = Math.min(200, Math.max(10, parsePositiveInt(url.searchParams.get('clearBatchSize'), 50)));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event, data) {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      // Send actionable errors through the stream so the client can display them.
      if (!session?.user?.isAdmin) {
        const isMaskedAdmin = !!session?.user?.isAdminActual && !!session?.user?.isAdminMasked;
        send('error', {
          message: isMaskedAdmin
            ? 'Admin is currently masked (viewing as non-admin). Disable "view as non-admin" to run sync.'
            : 'Unauthorized'
        });
        controller.close();
        return;
      }

      if (!platformIgdbId || Number.isNaN(platformIgdbId)) {
        send('error', { message: 'Invalid platform ID' });
        controller.close();
        return;
      }

      try {
        // Compute total count first for UI progress (best-effort)
        const countWhere = buildGameCountBody(platformIgdbId);
        let totalCount = 0;
        try {
          const countRes = await igdbRequest('games/count', countWhere);
          if (Array.isArray(countRes) && countRes[0]?.count != null) totalCount = countRes[0].count;
          else if (typeof countRes?.count === 'number') totalCount = countRes.count;
          else if (typeof countRes === 'number') totalCount = countRes;
        } catch {}
        send('total', { total: totalCount });
        if (clearFirst) {
          // Phase 1: Clear existing data for this platform (chunked)
          const where = { platforms: { some: { igdbId: platformIgdbId } } };

          const batch = await prisma.game.findMany({
            where,
            orderBy: { id: 'asc' },
            take: clearBatchSize,
            ...(clearCursor
              ? {
                  cursor: { id: clearCursor },
                  skip: 1
                }
              : {}),
            select: { id: true, platforms: { select: { igdbId: true } } }
          });

          let processedClear = 0;
          let disconnected = 0;
          let deleted = 0;
          for (const g of batch) {
            if ((g.platforms?.length || 0) <= 1) {
              await prisma.game.delete({ where: { id: g.id } });
              deleted++;
            } else {
              await prisma.game.update({
                where: { id: g.id },
                data: { platforms: { disconnect: { igdbId: platformIgdbId } } }
              });
              disconnected++;
            }
            processedClear++;
            if (processedClear % 10 === 0) {
              send('clear-progress', { processed: processedClear, disconnected, deleted, batchSize: batch.length });
            }
          }

          const next = batch.length === clearBatchSize ? batch[batch.length - 1]?.id : null;
          const done = !next;
          send('clear-done', { processed: processedClear, disconnected, deleted, batchSize: batch.length, nextCursor: next, done });
          send('done', { phase: 'clear', clear: { processed: processedClear, disconnected, deleted, batchSize: batch.length, nextCursor: next, done } });
          controller.close();
          return;
        }

        let processed = 0;
        let inserted = 0;
        let updated = 0;
        let page = 0;

        let localOffset = offset;
        let lastBatchCount = 0;

        while (page < maxPages) {
          page += 1;
          const body = buildGameQuery({ platformIgdbId, limit: pageSize, offset: localOffset });
          const games = await igdbRequest('games', body);
          if (!Array.isArray(games) || games.length === 0) break;

          lastBatchCount = games.length;

          for (const g of games) {
            const earliest = pickEarliestRelease(g.release_dates);
            const coverUrl = toCoverBigUrl(g.cover);
            const western = hasWesternRelease(g.release_dates);

            const existing = await prisma.game.findUnique({
              where: { igdbId: g.id },
              select: { id: true, platforms: { select: { igdbId: true } } }
            });

            if (!existing) {
              await prisma.game.create({
                data: {
                  igdbId: g.id,
                  name: g.name,
                  slug: g.slug ?? null,
                  coverUrl,
                  releaseDateUnix: earliest?.unix ?? null,
                  releaseDateHuman: earliest?.human ?? null,
                  hasWesternRelease: western,
                  platforms: { connect: { igdbId: platformIgdbId } }
                }
              });
              inserted++;
            } else {
              await prisma.game.update({
                where: { igdbId: g.id },
                data: {
                  name: g.name,
                  slug: g.slug ?? null,
                  coverUrl,
                  releaseDateUnix: earliest?.unix ?? null,
                  releaseDateHuman: earliest?.human ?? null,
                  hasWesternRelease: western
                }
              });
              const alreadyLinked = existing.platforms.some(p => p.igdbId === platformIgdbId);
              if (!alreadyLinked) {
                await prisma.game.update({
                  where: { igdbId: g.id },
                  data: { platforms: { connect: { igdbId: platformIgdbId } } }
                });
              }
              updated++;
            }
            processed++;
            // Emit progress more frequently than per page (every 50 items)
            if (processed % 50 === 0) {
              send('progress', { page, processed, inserted, updated, pageCount: games.length, total: totalCount, offset: localOffset, pageSize });
            }
          }

          send('progress', { page, processed, inserted, updated, pageCount: games.length, total: totalCount, offset: localOffset, pageSize });

          if (games.length < pageSize) break;
          localOffset += pageSize;
          if (localOffset > 20000) break; // safety guard
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
        send('error', { message: err?.message ? String(err.message) : String(err) });
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
