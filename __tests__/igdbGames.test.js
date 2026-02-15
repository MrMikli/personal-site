import {
  buildGameCountBody,
  buildGameQuery,
  hasWesternRelease,
  hasWesternReleaseForPlatform,
  pickEarliestRelease,
  toCoverBigUrl
} from "@/lib/igdbGames";

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

  test("toCoverBigUrl normalizes scheme and size", () => {
    expect(toCoverBigUrl({ url: "//images.igdb.com/igdb/image/upload/t_thumb/abc.jpg" }))
      .toBe("https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg");
  });

  test("hasWesternRelease checks region values", () => {
    expect(hasWesternRelease([{ region: 5 }])).toBe(false);
    expect(hasWesternRelease([{ region: 2 }])).toBe(true);
  });

  test("hasWesternReleaseForPlatform checks both region and platform", () => {
    const rds = [
      { region: 2, platform: { id: 48 } },
      { region: 2, platform: { id: 49 } }
    ];
    expect(hasWesternReleaseForPlatform(rds, 48)).toBe(true);
    expect(hasWesternReleaseForPlatform(rds, 50)).toBe(false);
  });
});
