import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { igdbRequest } from '@/lib/igdb';

function pickEarliestRelease(release_dates) {
  if (!Array.isArray(release_dates) || release_dates.length === 0) return null;
  // IGDB date is Unix seconds
  const sorted = [...release_dates].sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
  const first = sorted[0];
  return { unix: first?.date ?? null, human: first?.human ?? null };
}

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
    const body = `fields id, name, slug, game_type, release_dates.date, release_dates.human, cover.image_id, platforms.id;\nwhere platforms = ${platformIgdbId} & (game_status = null | game_status = 0) & version_parent = null & (game_type = null | game_type = 0) & language_supports.language = 7;\nsort id asc;\nlimit 500;`;
    const games = await igdbRequest('games', body);

    let inserted = 0;
    let updated = 0;

    for (const g of games) {
      const earliest = pickEarliestRelease(g.release_dates);
      const existing = await prisma.game.findUnique({ where: { igdbId: g.id } });

      await prisma.game.upsert({
        where: { igdbId: g.id },
        update: {
          name: g.name,
          slug: g.slug ?? null,
          gameType: g.game_type ?? null,
          coverImageId: g.cover?.image_id ?? null,
          releaseDateUnix: earliest?.unix ?? null,
          releaseDateHuman: earliest?.human ?? null,
          platforms: { connect: { igdbId: platformIgdbId } }
        },
        create: {
          igdbId: g.id,
          name: g.name,
          slug: g.slug ?? null,
          gameType: g.game_type ?? null,
          coverImageId: g.cover?.image_id ?? null,
          releaseDateUnix: earliest?.unix ?? null,
          releaseDateHuman: earliest?.human ?? null,
          platforms: { connect: { igdbId: platformIgdbId } }
        }
      });

      if (existing) updated++; else inserted++;
    }

    return NextResponse.json({ processed: games.length, inserted, updated });
  } catch (err) {
    return NextResponse.json({ message: 'Failed to sync games', error: String(err) }, { status: 500 });
  }
}
