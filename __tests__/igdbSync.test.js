import {
  clearPlatformGames,
  fetchPopularity,
  syncIgdbGamePage,
  upsertIgdbGames,
  upsertIgdbTags
} from "@/lib/igdbSync";
import { prisma } from "@/lib/prisma";
import { igdbRequest } from "@/lib/igdb";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    // Array form: resolves each queued operation in order, like the real client.
    $transaction: jest.fn((operations) => Promise.all(operations)),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    game: { createMany: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    gamePlatform: { deleteMany: jest.fn() },
    igdbTag: { createMany: jest.fn() }
  }
}));

jest.mock("@/lib/igdb", () => ({
  igdbRequest: jest.fn()
}));

const isRawFragment = (v) => !!v && typeof v === "object" && "sql" in v;

// $queryRaw / $executeRaw are called as tagged templates: (strings, ...values).
// Prisma.raw fragments are inlined; real parameters become "?".
function lastQuery(mock) {
  const [strings, ...values] = mock.mock.calls.at(-1);
  let sql = strings[0];
  values.forEach((v, i) => {
    sql += (isRawFragment(v) ? v.sql : "?") + strings[i + 1];
  });
  return { sql, params: values.filter((v) => !isRawFragment(v)) };
}

const PS1 = { platformId: "p-ps1", platformIgdbId: 7 };
const PC_VARIANT = { platformId: "p-pc", platformIgdbId: 6, yearStart: 1994, yearEnd: 1999 };

const GAME = {
  id: 101,
  name: "New Game",
  slug: "new-game",
  themes: [{ id: 34, name: "Educational", slug: "educational" }],
  release_dates: [
    { date: 820454400, human: "1996", y: 1996, platform: 6, release_region: 2 },
    { date: 800000000, human: "1995", y: 1995, platform: 7, release_region: 5 }
  ]
};

describe("lib/igdbSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("upsertIgdbGames", () => {
    test("creates missing games through Prisma, then fills every row in one statement", async () => {
      prisma.game.createMany.mockResolvedValueOnce({ count: 1 });
      prisma.$queryRaw.mockResolvedValueOnce([{ total: 2n }]);

      const result = await upsertIgdbGames([GAME, { id: 102, name: "Sparse Game" }], {
        platformsFor: () => [PS1],
        popularity: new Map([[101, { popPlayed: 0.5 }]])
      });

      expect(result).toEqual({ processed: 2, inserted: 1, updated: 1 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.game.createMany).toHaveBeenCalledWith({
        data: [
          { igdbId: 101, name: "New Game" },
          { igdbId: 102, name: "Sparse Game" }
        ],
        skipDuplicates: true
      });

      const { sql, params } = lastQuery(prisma.$queryRaw);
      expect(sql).toContain('UPDATE "Game" AS g');
      expect(sql).toContain('"themeIds" = x."themeIds"');
      expect(sql).toContain('"popPlayed" = x."popPlayed"');
      expect(sql).toContain('"popularitySyncedAt" = NOW()');
      expect(sql).toContain('INSERT INTO "_GameToPlatform"');
      expect(sql).toContain('ON CONFLICT ("gameId", "platformId")');

      const [gameJson, gamePlatformJson] = params;
      const gameRows = JSON.parse(gameJson);
      expect(gameRows[0]).toMatchObject({
        igdbId: 101,
        slug: "new-game",
        themeIds: [34],
        releaseDateUnix: 800000000,
        hasWesternRelease: true,
        popPlayed: 0.5,
        popVisits: null,
        igdbData: GAME
      });
      // Keys IGDB left out become nulls and empty arrays, never missing columns.
      expect(gameRows[1]).toMatchObject({ igdbId: 102, slug: null, themeIds: [], popPlayed: null });

      // Western on PC (6) only, so not western for the platform being synced (7).
      expect(JSON.parse(gamePlatformJson)).toEqual([
        { igdbId: 101, platformId: "p-ps1", hasWesternRelease: false, releaseYear: 1995, releaseDateUnix: 800000000, releaseRegionIds: [5] },
        { igdbId: 102, platformId: "p-ps1", hasWesternRelease: false, releaseYear: null, releaseDateUnix: null, releaseRegionIds: [] }
      ]);
    });

    test("writes one GamePlatform row per linked platform and leaves popularity alone when not given", async () => {
      prisma.game.createMany.mockResolvedValueOnce({ count: 0 });
      prisma.$queryRaw.mockResolvedValueOnce([{ total: 1n }]);

      await upsertIgdbGames([GAME], { platformsFor: () => [PS1, PC_VARIANT] });

      const { sql, params } = lastQuery(prisma.$queryRaw);
      expect(sql).not.toContain("popPlayed");
      expect(sql).not.toContain("popularitySyncedAt");
      expect(JSON.parse(params[1]).map((r) => [r.platformId, r.releaseYear, r.hasWesternRelease])).toEqual([
        ["p-ps1", 1995, false],
        ["p-pc", 1996, true]
      ]);
    });

    test("drops duplicate and nameless games, and skips the database for an empty page", async () => {
      prisma.game.createMany.mockResolvedValueOnce({ count: 0 });
      prisma.$queryRaw.mockResolvedValueOnce([{ total: 1n }]);

      await upsertIgdbGames([{ id: 1, name: "A" }, { id: 1, name: "A again" }, { id: 2 }], {
        platformsFor: () => [PS1]
      });
      expect(prisma.game.createMany.mock.calls[0][0].data).toEqual([{ igdbId: 1, name: "A again" }]);

      jest.clearAllMocks();
      await expect(upsertIgdbGames([], { platformsFor: () => [PS1] })).resolves.toEqual({
        processed: 0,
        inserted: 0,
        updated: 0
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("upsertIgdbTags", () => {
    test("creates new tags and renames changed ones", async () => {
      prisma.igdbTag.createMany.mockResolvedValueOnce({ count: 1 });
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await expect(upsertIgdbTags([GAME])).resolves.toBe(1);

      const tags = [{ kind: "THEME", igdbId: 34, name: "Educational", slug: "educational" }];
      expect(prisma.igdbTag.createMany).toHaveBeenCalledWith({ data: tags, skipDuplicates: true });
      const { sql, params } = lastQuery(prisma.$executeRaw);
      expect(sql).toContain('UPDATE "IgdbTag" AS t');
      expect(JSON.parse(params[0])).toEqual(tags);
    });

    test("does nothing when the page has no named tags", async () => {
      await expect(upsertIgdbTags([{ id: 1, name: "A", genres: [5] }])).resolves.toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  test("fetchPopularity asks IGDB once and skips the request for no ids", async () => {
    igdbRequest.mockResolvedValueOnce([
      { name: "type4", result: [{ game_id: 101, popularity_type: 4, value: 0.25 }] }
    ]);

    const popularity = await fetchPopularity([101, 102]);

    expect(igdbRequest).toHaveBeenCalledTimes(1);
    expect(igdbRequest.mock.calls[0][0]).toBe("multiquery");
    expect(popularity.get(101)).toEqual({ popPlayed: 0.25 });

    await expect(fetchPopularity([])).resolves.toEqual(new Map());
    expect(igdbRequest).toHaveBeenCalledTimes(1);
  });

  test("syncIgdbGamePage fetches popularity, writes games, then tags", async () => {
    igdbRequest.mockResolvedValueOnce([
      { name: "type1", result: [{ game_id: 101, popularity_type: 1, value: 0.1 }] }
    ]);
    prisma.game.createMany.mockResolvedValueOnce({ count: 1 });
    prisma.$queryRaw.mockResolvedValueOnce([{ total: 1n }]);
    prisma.igdbTag.createMany.mockResolvedValueOnce({ count: 1 });
    prisma.$executeRaw.mockResolvedValueOnce(0);

    const result = await syncIgdbGamePage([GAME], { platformsFor: () => [PS1] });

    expect(result).toEqual({ processed: 1, inserted: 1, updated: 0 });
    expect(igdbRequest.mock.calls[0][1]).toContain("game_id = (101)");
    expect(JSON.parse(lastQuery(prisma.$queryRaw).params[0])[0].popVisits).toBe(0.1);
    expect(prisma.igdbTag.createMany).toHaveBeenCalledTimes(1);
  });

  describe("clearPlatformGames", () => {
    test("deletes unused single-platform games, keeps rolled ones, unlinks the rest", async () => {
      prisma.game.findMany.mockResolvedValueOnce([{ id: "rolled" }]);
      prisma.game.deleteMany.mockResolvedValueOnce({ count: 4 });
      prisma.$executeRaw.mockResolvedValueOnce(2);
      prisma.gamePlatform.deleteMany.mockResolvedValueOnce({ count: 2 });

      const result = await clearPlatformGames("p1");

      expect(result).toEqual({ deleted: 4, disconnected: 2, skipped: 1 });

      const onlyThisPlatform = { some: { id: "p1" }, every: { id: "p1" } };
      const inUse = { OR: [{ rolls: { some: {} } }, { selectedInSignups: { some: {} } }] };
      expect(prisma.game.findMany).toHaveBeenCalledWith({
        where: { platforms: onlyThisPlatform, ...inUse },
        select: { id: true }
      });
      expect(prisma.game.deleteMany).toHaveBeenCalledWith({
        where: { platforms: onlyThisPlatform, NOT: inUse }
      });

      const { sql, params } = lastQuery(prisma.$executeRaw);
      expect(sql).toContain('DELETE FROM "_GameToPlatform"');
      expect(params).toEqual(["p1", ["rolled"]]);
      expect(prisma.gamePlatform.deleteMany).toHaveBeenCalledWith({
        where: { platformId: "p1", gameId: { notIn: ["rolled"] } }
      });
    });
  });
});
