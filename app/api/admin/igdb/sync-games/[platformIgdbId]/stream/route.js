import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { igdbRequest } from '@/lib/igdb';

function pickEarliestRelease(release_dates) {
  if (!Array.isArray(release_dates) || release_dates.length === 0) return null;
  const sorted = [...release_dates].sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
  const first = sorted[0];
  return { unix: first?.date ?? null, human: first?.human ?? null };
}

function toCoverBigUrl(cover) {
  const raw = cover?.url;
  if (!raw) return null;
  const withScheme = raw.startsWith('//') ? `https:${raw}` : raw;
  return withScheme.replace(/\/t_[^/]+\//, '/t_cover_big/');
}

export async function GET(req, { params }) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return new Response('Unauthorized', { status: 401 });
  }

  const platformIgdbId = Number(params?.platformIgdbId);
  if (!platformIgdbId || Number.isNaN(platformIgdbId)) {
    return new Response('Invalid platform ID', { status: 400 });
  }

  const url = new URL(req.url);
  const clearFirst = url.searchParams.get('clear') === 'true';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event, data) {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // Compute total count first for UI progress (best-effort)
        const countWhere = `where platforms = ${platformIgdbId} & (game_status = null | game_status = 0) & version_parent = null & ((game_type = null | game_type = 0) | (category = null | category = 0));`;
        let totalCount = 0;
        try {
          const countRes = await igdbRequest('games/count', countWhere);
          if (Array.isArray(countRes) && countRes[0]?.count != null) totalCount = countRes[0].count;
          else if (typeof countRes?.count === 'number') totalCount = countRes.count;
          else if (typeof countRes === 'number') totalCount = countRes;
        } catch {}
        send('total', { total: totalCount });
        if (clearFirst) {
          // Phase 1: Clear existing data for this platform
          const toProcess = await prisma.game.findMany({
            where: { platforms: { some: { igdbId: platformIgdbId } } },
            select: { id: true, igdbId: true, platforms: { select: { igdbId: true } } }
          });
          let processedClear = 0;
          let disconnected = 0;
          let deleted = 0;
          for (const g of toProcess) {
            // If game only exists on this platform, delete; otherwise disconnect
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
            if (processedClear % 50 === 0) {
              send('clear-progress', { total: toProcess.length, processed: processedClear, disconnected, deleted });
            }
          }
          send('clear-done', { total: toProcess.length, processed: processedClear, disconnected, deleted });
        }

        const pageSize = 500;
        let offset = 0;
        let processed = 0;
        let inserted = 0;
        let updated = 0;
        let page = 0;

        while (true) {
          page += 1;
          const body = `fields id, name, slug, release_dates.date, release_dates.human, cover.url, platforms.id;\nwhere platforms = ${platformIgdbId} & (game_status = null | game_status = 0) & version_parent = null & ((game_type = null | game_type = 0) | (category = null | category = 0));\nsort id asc;\nlimit ${pageSize};\noffset ${offset};`;
          const games = await igdbRequest('games', body);
          if (!Array.isArray(games) || games.length === 0) break;

          for (const g of games) {
            const earliest = pickEarliestRelease(g.release_dates);
            const coverUrl = toCoverBigUrl(g.cover);

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
                  releaseDateHuman: earliest?.human ?? null
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
              send('progress', { page, processed, inserted, updated, pageCount: games.length, total: totalCount });
            }
          }

          send('progress', { page, processed, inserted, updated, pageCount: games.length, total: totalCount });

          if (games.length < pageSize) break;
          offset += pageSize;
          if (offset > 20000) break; // safety guard
        }

        send('done', { processed, inserted, updated });
        controller.close();
      } catch (err) {
        send('error', { message: String(err) });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
