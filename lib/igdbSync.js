// Set-based writes for IGDB game sync.
// Every statement is a network round trip to the database (~30ms each), so a page of games
// is written with a fixed number of statements instead of several queries per game.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { igdbRequest } from '@/lib/igdb';
import {
  buildPopularityMultiquery,
  collectIgdbTags,
  mapGamePlatform,
  mapIgdbGame,
  mapPopularity
} from '@/lib/igdbGames';

// [column, postgres type] pairs written from IGDB data. Keep in step with prisma/schema.prisma and the
// mappers in lib/igdbGames.js. Column names are constants, never user input.
const GAME_COLUMNS = [
  ['name', 'text'],
  ['slug', 'text'],
  ['url', 'text'],
  ['coverUrl', 'text'],
  ['releaseDateUnix', 'int'],
  ['releaseDateHuman', 'text'],
  ['hasWesternRelease', 'boolean'],
  ['genreIds', 'int[]'],
  ['themeIds', 'int[]'],
  ['keywordIds', 'int[]'],
  ['gameModeIds', 'int[]'],
  ['perspectiveIds', 'int[]'],
  ['collectionIds', 'int[]'],
  ['franchiseIds', 'int[]'],
  ['developerIds', 'int[]'],
  ['publisherIds', 'int[]'],
  ['porterIds', 'int[]'],
  ['languageIds', 'int[]'],
  ['hasEnglish', 'boolean'],
  ['rating', 'double precision'],
  ['ratingCount', 'int'],
  ['aggregatedRating', 'double precision'],
  ['aggregatedRatingCount', 'int'],
  ['totalRating', 'double precision'],
  ['totalRatingCount', 'int'],
  ['igdbData', 'jsonb']
];

const POPULARITY_COLUMNS = [
  ['popVisits', 'double precision'],
  ['popWantToPlay', 'double precision'],
  ['popPlaying', 'double precision'],
  ['popPlayed', 'double precision']
];

const GAME_PLATFORM_COLUMNS = [
  ['hasWesternRelease', 'boolean'],
  ['releaseYear', 'int'],
  ['releaseDateUnix', 'int'],
  ['releaseRegionIds', 'int[]']
];

const quote = (name) => `"${name}"`;
const columnList = (columns, prefix = '') => columns.map(([name]) => `${prefix}${quote(name)}`).join(', ');
const recordDef = (columns) => columns.map(([name, type]) => `${quote(name)} ${type}`).join(', ');
const assignFrom = (columns, source) => columns.map(([name]) => `${quote(name)} = ${source}.${quote(name)}`).join(', ');

/**
 * Popularity scores for up to 500 games, as Map(igdbId -> { popVisits, popWantToPlay, popPlaying, popPlayed }).
 */
export async function fetchPopularity(igdbIds) {
  if (igdbIds.length === 0) return new Map();
  return mapPopularity(await igdbRequest('multiquery', buildPopularityMultiquery(igdbIds)));
}

/**
 * Writes one page of IGDB games and their GamePlatform rows.
 *   platformsFor(game) -> [{ platformId, platformIgdbId, yearStart, yearEnd }]: the platforms to link the game to.
 *   popularity: Map from fetchPopularity. When omitted, the popularity columns are left untouched.
 * New games are created through Prisma so their ids are generated like every other row, then one statement
 * fills all columns, links the platforms and upserts GamePlatform. Both run in one transaction, so a page
 * lands completely or not at all, and writing the same page twice gives the same result.
 */
export async function upsertIgdbGames(games, { platformsFor, popularity = null }) {
  // Deduplicate by IGDB id (last one wins) and drop entries IGDB returned without a name.
  const byIgdbId = new Map();
  for (const g of games) {
    if (g?.id == null || !g.name) continue;
    byIgdbId.set(g.id, g);
  }
  const unique = [...byIgdbId.values()];
  if (unique.length === 0) return { processed: 0, inserted: 0, updated: 0 };

  // Popularity columns are only part of the statement when scores were fetched.
  const gameColumns = popularity ? [...GAME_COLUMNS, ...POPULARITY_COLUMNS] : GAME_COLUMNS;
  const emptyPopularity = Object.fromEntries(POPULARITY_COLUMNS.map(([name]) => [name, null]));

  const gameRows = unique.map((g) => ({
    igdbId: g.id,
    ...mapIgdbGame(g),
    ...(popularity ? { ...emptyPopularity, ...popularity.get(g.id) } : {})
  }));
  // One GamePlatform row per (game, linked platform) pair.
  const gamePlatformRows = unique.flatMap((g) =>
    platformsFor(g).map((platform) => ({
      igdbId: g.id,
      platformId: platform.platformId,
      ...mapGamePlatform(g, platform.platformIgdbId, platform)
    }))
  );

  const gameJson = JSON.stringify(gameRows);
  const gamePlatformJson = JSON.stringify(gamePlatformRows);
  const syncedAt = popularity ? Prisma.raw(', "popularitySyncedAt" = NOW()') : Prisma.empty;

  // CTE chain: update games -> pair them with their platform rows -> link -> upsert GamePlatform.
  const [created, rows] = await prisma.$transaction([
    prisma.game.createMany({
      data: unique.map((g) => ({ igdbId: g.id, name: g.name })),
      skipDuplicates: true
    }),
    prisma.$queryRaw`
      WITH updated AS (
        UPDATE "Game" AS g
        SET ${Prisma.raw(assignFrom(gameColumns, 'x'))}, "igdbSyncedAt" = NOW(), "updatedAt" = NOW()${syncedAt}
        FROM jsonb_to_recordset(${gameJson}::jsonb) AS x("igdbId" int, ${Prisma.raw(recordDef(gameColumns))})
        WHERE g."igdbId" = x."igdbId"
        RETURNING g."id", g."igdbId"
      ),
      platform_rows AS (
        SELECT updated."id" AS "gameId", y.*
        FROM updated
        JOIN jsonb_to_recordset(${gamePlatformJson}::jsonb)
          AS y("igdbId" int, "platformId" text, ${Prisma.raw(recordDef(GAME_PLATFORM_COLUMNS))})
          ON y."igdbId" = updated."igdbId"
      ),
      linked AS (
        INSERT INTO "_GameToPlatform" ("A", "B")
        SELECT "gameId", "platformId" FROM platform_rows
        ON CONFLICT DO NOTHING
      ),
      game_platforms AS (
        INSERT INTO "GamePlatform" ("gameId", "platformId", ${Prisma.raw(columnList(GAME_PLATFORM_COLUMNS))}, "updatedAt")
        SELECT "gameId", "platformId", ${Prisma.raw(columnList(GAME_PLATFORM_COLUMNS))}, NOW() FROM platform_rows
        ON CONFLICT ("gameId", "platformId")
        DO UPDATE SET ${Prisma.raw(assignFrom(GAME_PLATFORM_COLUMNS, 'EXCLUDED'))}, "updatedAt" = NOW()
      )
      SELECT COUNT(*) AS "total" FROM updated
    `
  ]);

  const total = Number(rows?.[0]?.total ?? 0);
  const inserted = created?.count ?? 0;
  return { processed: total, inserted, updated: total - inserted };
}

/**
 * Stores the names of every tag on a page of games. New tags are created through Prisma (for its ids);
 * a second statement renames tags whose name or slug changed in IGDB.
 */
export async function upsertIgdbTags(games) {
  const tags = collectIgdbTags(games);
  if (tags.length === 0) return 0;

  const tagJson = JSON.stringify(tags);
  await prisma.$transaction([
    prisma.igdbTag.createMany({ data: tags, skipDuplicates: true }),
    prisma.$executeRaw`
      UPDATE "IgdbTag" AS t
      SET "name" = x."name", "slug" = x."slug", "updatedAt" = NOW()
      FROM jsonb_to_recordset(${tagJson}::jsonb) AS x("kind" text, "igdbId" int, "name" text, "slug" text)
      WHERE t."kind" = x."kind"::"IgdbTagKind" AND t."igdbId" = x."igdbId"
        AND (t."name" IS DISTINCT FROM x."name" OR t."slug" IS DISTINCT FROM x."slug")
    `
  ]);
  return tags.length;
}

/**
 * Everything a page of IGDB games needs: popularity lookup, game and platform rows, tag names.
 */
export async function syncIgdbGamePage(games, { platformsFor }) {
  const igdbIds = [...new Set(games.map((g) => g?.id).filter((id) => id != null))];
  const popularity = await fetchPopularity(igdbIds);
  const written = await upsertIgdbGames(games, { platformsFor, popularity });
  await upsertIgdbTags(games);
  return written;
}

/**
 * Removes a platform's games ahead of a fresh import.
 * Games only on this platform are deleted, unless a player rolled or picked them: those rows are
 * referenced by HeatRoll / HeatSignup, so they stay linked and are reported as skipped.
 * Games that are also on other platforms are unlinked from this one.
 */
export async function clearPlatformGames(platformId) {
  const onlyThisPlatform = { platforms: { some: { id: platformId }, every: { id: platformId } } };
  const inUse = { OR: [{ rolls: { some: {} } }, { selectedInSignups: { some: {} } }] };

  // Find the protected games first so the delete and unlink below can exclude them.
  const kept = await prisma.game.findMany({
    where: { ...onlyThisPlatform, ...inUse },
    select: { id: true }
  });
  const keptIds = kept.map((g) => g.id);

  const deleted = await prisma.game.deleteMany({ where: { ...onlyThisPlatform, NOT: inUse } });

  const disconnected = await prisma.$executeRaw`
    DELETE FROM "_GameToPlatform" WHERE "B" = ${platformId} AND "A" <> ALL(${keptIds}::text[])
  `;
  await prisma.gamePlatform.deleteMany({ where: { platformId, gameId: { notIn: keptIds } } });

  return { deleted: deleted.count, disconnected: Number(disconnected), skipped: keptIds.length };
}
