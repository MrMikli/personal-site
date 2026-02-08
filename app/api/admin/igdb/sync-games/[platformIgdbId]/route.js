import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { igdbRequest } from '@/lib/igdb';
import { buildGameQuery, pickEarliestRelease, toCoverBigUrl, hasWesternRelease } from '@/lib/igdbGames';

export async function POST(_req, { params }) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const platformIgdbId = Number(params?.platformIgdbId);
  if (!platformIgdbId || Number.isNaN(platformIgdbId)) {
    return NextResponse.json({ message: 'Invalid platform ID' }, { status: 400 });
  }

  try {
    const pageSize = 500;
    let offset = 0;
    let processed = 0;
    let inserted = 0;
    let updated = 0;

    // Loop through all pages until fewer than pageSize results
    // Using filter: main games only (via game_type or category), released, no versions/remasters
    while (true) {
      const body = buildGameQuery({ platformIgdbId, limit: pageSize, offset });
      const games = await igdbRequest('games', body);
      if (!Array.isArray(games) || games.length === 0) break;

      for (const g of games) {
        const earliest = pickEarliestRelease(g.release_dates);
        const coverUrl = toCoverBigUrl(g.cover);
        const western = hasWesternRelease(g.release_dates);

        const existing = await prisma.game.findUnique({
          where: { igdbId: g.id },
          select: { id: true, platforms: { select: { igdbId: true } } },
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
              platforms: { connect: { igdbId: platformIgdbId } },
            },
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
              hasWesternRelease: western,
            },
          });
          // Connect platform only if not already linked to avoid duplicate relation errors
          const alreadyLinked = existing.platforms.some((p) => p.igdbId === platformIgdbId);
          if (!alreadyLinked) {
            await prisma.game.update({
              where: { igdbId: g.id },
              data: { platforms: { connect: { igdbId: platformIgdbId } } },
            });
          }
          updated++;
        }
        processed++;
      }

      if (games.length < pageSize) break;
      offset += pageSize;
      // Safety guard: don't loop forever
      if (offset > 20000) break;
    }

    return NextResponse.json({ processed, inserted, updated });
  } catch (err) {
    console.error('IGDB sync error', err);
    return NextResponse.json({ message: 'Failed to sync games from IGDB' }, { status: 500 });
  }

}
