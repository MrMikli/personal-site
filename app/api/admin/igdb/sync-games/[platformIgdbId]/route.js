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
    const body = `fields id, name, slug, release_dates.date, release_dates.human, cover.image_id, platforms.id;\nwhere platforms = ${platformIgdbId} & (game_status = null | game_status = 0) & version_parent = null & ((game_type = null | game_type = 0) | (category = null | category = 0));\nsort id asc;\nlimit 500;`;
    const games = await igdbRequest('games', body);

    try {
      const pageSize = 500;
      let offset = 0;
      let processed = 0;
      let inserted = 0;
      let updated = 0;

      function toCoverBigUrl(cover) {
        const raw = cover?.url;
        if (!raw) return null;
        const withScheme = raw.startsWith('//') ? `https:${raw}` : raw;
        return withScheme.replace(/\/t_[^/]+\//, '/t_cover_big/');
      }

      // Loop through all pages until fewer than pageSize results
      // Using filter: main games only (via game_type or category), released, no versions/remasters
      while (true) {
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
            // Connect platform only if not already linked to avoid duplicate relation errors
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
        }

        if (games.length < pageSize) break;
        offset += pageSize;
        // Safety guard: don't loop forever
        if (offset > 20000) break;
      }

      return NextResponse.json({ processed, inserted, updated });
