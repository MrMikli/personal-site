import {
  buildGameCountBody,
  buildGameQuery,
  buildGamesByIdQuery,
  buildPopularityMultiquery,
  collectIgdbTags,
  hasWesternRelease,
  mapGamePlatform,
  mapIgdbGame,
  mapPopularity,
  pickEarliestRelease,
  toCoverBigUrl
} from "@/lib/igdbGames";

// Shaped like IGDB's response for Metal Gear Solid (375) with IGDB_GAME_FIELDS, trimmed.
const FULL_GAME = {
  id: 375,
  name: "Metal Gear Solid",
  slug: "metal-gear-solid",
  url: "https://www.igdb.com/games/metal-gear-solid",
  cover: { id: 1, url: "//images.igdb.com/igdb/image/upload/t_thumb/co1.jpg" },
  genres: [{ id: 5, name: "Shooter", slug: "shooter" }, { id: 31, name: "Adventure", slug: "adventure" }],
  themes: [{ id: 23, name: "Stealth", slug: "stealth" }],
  keywords: [{ id: 189, name: "kojima", slug: "kojima" }],
  game_modes: [{ id: 1, name: "Single player", slug: "single-player" }],
  player_perspectives: [{ id: 2, name: "Third person", slug: "third-person" }],
  collections: [{ id: 2128, name: "Metal Gear Solid", slug: "metal-gear-solid" }],
  franchises: [{ id: 463, name: "Metal Gear", slug: "metal-gear" }],
  involved_companies: [
    { id: 1, company: { id: 312, name: "KCEJ", slug: "kcej" }, developer: true, publisher: false, porting: false, supporting: false },
    { id: 2, company: { id: 129, name: "Konami", slug: "konami" }, developer: false, publisher: true, porting: false, supporting: false },
    { id: 3, company: { id: 900, name: "Port House", slug: "port-house" }, developer: false, publisher: false, porting: true, supporting: false }
  ],
  rating: 90.51,
  rating_count: 1711,
  aggregated_rating: 80,
  aggregated_rating_count: 1,
  total_rating: 85.26,
  total_rating_count: 1712,
  release_dates: [
    { id: 1, date: 904780800, human: "Sep 03, 1998", y: 1998, m: 9, platform: 7, status: 6, date_format: 0, release_region: 5 },
    { id: 2, date: 908841600, human: "Oct 20, 1998", y: 1998, m: 10, platform: 7, status: 6, date_format: 0, release_region: 2 },
    { id: 3, date: 970358400, human: "Sep 30, 2000", y: 2000, m: 9, platform: 6, status: 6, date_format: 0, release_region: 2 },
    { id: 4, date: 1258588800, human: "Nov 19, 2009", y: 2009, m: 11, platform: 9, status: 35, date_format: 0, release_region: 1 }
  ],
  language_supports: [
    { id: 1, language: { id: 7, name: "English", locale: "en-US" }, language_support_type: 3 },
    { id: 2, language: { id: 7, name: "English", locale: "en-US" }, language_support_type: 1 },
    { id: 3, language: { id: 16, name: "Japanese", locale: "ja-JP" }, language_support_type: 1 }
  ]
};

// Shaped like Reader Rabbit 1st Grade (88280): IGDB omits keys that have no value.
const SPARSE_GAME = {
  id: 88280,
  name: "Reader Rabbit 1st Grade",
  themes: [{ id: 34, name: "Educational", slug: "educational" }],
  release_dates: [{ id: 9, date: 915062400, human: "1998", y: 1998, platform: 7, date_format: 2, release_region: 8 }]
};

describe("lib/igdbGames", () => {
  test("buildGameQuery includes limit/offset and platform", () => {
    const q = buildGameQuery({ platformIgdbId: 48, limit: 200, offset: 500 });
    expect(q).toContain("limit 200");
    expect(q).toContain("offset 500");
    expect(q).toContain("platforms = 48");
  });

  test("buildGameCountBody includes where clause", () => {
    const q = buildGameCountBody(48);
    expect(q).toContain("where");
    expect(q).toContain("platforms = 48");
  });

  test("pickEarliestRelease picks smallest unix date", () => {
    const earliest = pickEarliestRelease([
      { date: 200, human: "B" },
      { date: 100, human: "A" }
    ]);
    expect(earliest).toEqual({ unix: 100, human: "A" });
  });

  test("pickEarliestRelease skips entries without a date", () => {
    // Shaped like Super Mario Bros. 3 (IGDB lists an undated "TBD" entry next to the real ones).
    const earliest = pickEarliestRelease(
      [
        { id: 514575, date: 683424000, human: "Aug 29, 1991", platform: 18, date_format: 0, release_region: 1 },
        { id: 514578, human: "TBD", platform: 18, date_format: 7, release_region: 10 },
        { id: 514570, date: 593568000, human: "Oct 23, 1988", platform: 99, date_format: 0, release_region: 5 }
      ],
      593568000
    );
    expect(earliest).toEqual({ unix: 593568000, human: "Oct 23, 1988" });
  });

  test("pickEarliestRelease falls back to first_release_date when no entry is dated", () => {
    expect(pickEarliestRelease([{ id: 1, human: "TBD", date_format: 7 }], 904780800))
      .toEqual({ unix: 904780800, human: "Sep 03, 1998" });
    expect(pickEarliestRelease(undefined, 904780800)).toEqual({ unix: 904780800, human: "Sep 03, 1998" });
  });

  test("pickEarliestRelease returns null when nothing is dated", () => {
    expect(pickEarliestRelease([{ id: 1, human: "TBD", date_format: 7 }])).toBeNull();
    expect(pickEarliestRelease([])).toBeNull();
    expect(mapIgdbGame({ id: 1, name: "A", release_dates: [{ id: 1, human: "TBD" }] }))
      .toMatchObject({ releaseDateUnix: null, releaseDateHuman: null });
  });

  test("toCoverBigUrl normalizes scheme and size", () => {
    expect(toCoverBigUrl({ url: "//images.igdb.com/igdb/image/upload/t_thumb/abc.jpg" }))
      .toBe("https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg");
  });

  test("hasWesternRelease checks region values", () => {
    expect(hasWesternRelease([{ region: 5 }])).toBe(false);
    expect(hasWesternRelease([{ region: 2 }])).toBe(true);
  });

  test("buildGamesByIdQuery fetches exactly the given ids", () => {
    const q = buildGamesByIdQuery([375, 88280]);
    expect(q).toContain("where id = (375,88280);");
    expect(q).toContain("limit 2;");
    expect(q).toContain("themes.name");
    // Region and status must stay plain ids for the release helpers.
    expect(q).toContain("release_dates.release_region,");
    expect(q).not.toContain("release_region.region");
  });

  describe("mapIgdbGame", () => {
    test("maps a fully populated game", () => {
      expect(mapIgdbGame(FULL_GAME)).toEqual({
        name: "Metal Gear Solid",
        slug: "metal-gear-solid",
        url: "https://www.igdb.com/games/metal-gear-solid",
        coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg",
        releaseDateUnix: 904780800,
        releaseDateHuman: "Sep 03, 1998",
        hasWesternRelease: true,
        genreIds: [5, 31],
        themeIds: [23],
        keywordIds: [189],
        gameModeIds: [1],
        perspectiveIds: [2],
        collectionIds: [2128],
        franchiseIds: [463],
        developerIds: [312],
        publisherIds: [129],
        porterIds: [900],
        // English appears twice (audio and interface) but is stored once.
        languageIds: [7, 16],
        hasEnglish: true,
        rating: 90.51,
        ratingCount: 1711,
        aggregatedRating: 80,
        aggregatedRatingCount: 1,
        totalRating: 85.26,
        totalRatingCount: 1712,
        igdbData: FULL_GAME
      });
    });

    test("defaults every key IGDB left out", () => {
      expect(mapIgdbGame(SPARSE_GAME)).toMatchObject({
        slug: null,
        url: null,
        coverUrl: null,
        themeIds: [34],
        genreIds: [],
        keywordIds: [],
        collectionIds: [],
        developerIds: [],
        languageIds: [],
        hasEnglish: false,
        rating: null,
        totalRatingCount: null
      });
    });

    test("accepts unexpanded id arrays", () => {
      const mapped = mapIgdbGame({ id: 1, name: "A", genres: [5, 8], involved_companies: [{ company: 129, publisher: true }] });
      expect(mapped.genreIds).toEqual([5, 8]);
      expect(mapped.publisherIds).toEqual([129]);
    });
  });

  describe("mapGamePlatform", () => {
    test("uses only the platform's own releases", () => {
      expect(mapGamePlatform(FULL_GAME, 7)).toEqual({
        hasWesternRelease: true,
        releaseYear: 1998,
        releaseDateUnix: 904780800,
        releaseRegionIds: [5, 2]
      });
      expect(mapGamePlatform(FULL_GAME, 6)).toMatchObject({ releaseYear: 2000, releaseRegionIds: [2] });
    });

    test("ignores digital re-releases when the platform also has an original release", () => {
      const game = {
        release_dates: [
          { date: 1258588800, y: 2009, platform: 7, status: 35, release_region: 1 },
          { date: 904780800, y: 1998, platform: 7, status: 6, release_region: 5 }
        ]
      };
      expect(mapGamePlatform(game, 7)).toMatchObject({ releaseYear: 1998, releaseDateUnix: 904780800 });
      // Regions still count every release on the platform.
      expect(mapGamePlatform(game, 7).releaseRegionIds).toEqual([1, 5]);
    });

    test("falls back to the re-release when that is the only release on the platform", () => {
      expect(mapGamePlatform(FULL_GAME, 9)).toMatchObject({ releaseYear: 2009, hasWesternRelease: true });
    });

    test("a year-range variant takes the earliest release inside its range", () => {
      const game = {
        release_dates: [
          { date: 757382400, y: 1994, platform: 6, release_region: 2 },
          { date: 946684800, y: 2000, platform: 6, release_region: 1 },
          { date: 1009843200, y: 2002, platform: 6, release_region: 5 }
        ]
      };
      expect(mapGamePlatform(game, 6, { yearStart: 2000, yearEnd: 2005 })).toMatchObject({
        releaseYear: 2000,
        releaseDateUnix: 946684800
      });
      expect(mapGamePlatform(game, 6).releaseYear).toBe(1994);
    });

    test("returns nulls when the game has no release on the platform", () => {
      expect(mapGamePlatform(SPARSE_GAME, 18)).toEqual({
        hasWesternRelease: false,
        releaseYear: null,
        releaseDateUnix: null,
        releaseRegionIds: []
      });
      expect(mapGamePlatform({}, 7).releaseYear).toBeNull();
    });
  });

  test("collectIgdbTags keeps kinds apart and deduplicates", () => {
    const tags = collectIgdbTags([
      FULL_GAME,
      SPARSE_GAME,
      // Genre 34 and theme 34 are different things; bare ids have no name and are skipped.
      { id: 3, name: "C", genres: [{ id: 34, name: "Visual Novel", slug: "visual-novel" }], themes: [23] }
    ]);

    expect(tags).toContainEqual({ kind: "THEME", igdbId: 34, name: "Educational", slug: "educational" });
    expect(tags).toContainEqual({ kind: "GENRE", igdbId: 34, name: "Visual Novel", slug: "visual-novel" });
    expect(tags).toContainEqual({ kind: "COMPANY", igdbId: 129, name: "Konami", slug: "konami" });
    expect(tags).toContainEqual({ kind: "LANGUAGE", igdbId: 7, name: "English", slug: "en-US" });
    expect(tags.filter((t) => t.kind === "LANGUAGE")).toHaveLength(2);
    expect(tags.filter((t) => t.kind === "THEME")).toHaveLength(2);
  });

  test("popularity: one multiquery block per type, mapped to columns per game", () => {
    const body = buildPopularityMultiquery([375, 5906]);
    expect(body.match(/query popularity_primitives/g)).toHaveLength(4);
    expect(body).toContain("where game_id = (375,5906) & popularity_type = 4; limit 500;");

    const map = mapPopularity([
      { name: "type1", result: [{ game_id: 375, popularity_type: 1, value: 0.00007 }] },
      { name: "type4", result: [{ game_id: 375, popularity_type: 4, value: 0.00099 }, { game_id: 5906, popularity_type: 4, value: 0.00001 }] },
      { name: "type2" }
    ]);
    expect(map.get(375)).toEqual({ popVisits: 0.00007, popPlayed: 0.00099 });
    expect(map.get(5906)).toEqual({ popPlayed: 0.00001 });
    expect(mapPopularity(null).size).toBe(0);
  });
});
