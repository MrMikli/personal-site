import { GET } from "@/app/api/admin/igdb/backfill-games/stream/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { igdbRequest } from "@/lib/igdb";
import { syncIgdbGamePage } from "@/lib/igdbSync";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    game: { count: jest.fn(), findMany: jest.fn() }
  }
}));

jest.mock("@/lib/igdb", () => ({
  igdbRequest: jest.fn()
}));

jest.mock("@/lib/igdbSync", () => ({
  syncIgdbGamePage: jest.fn()
}));

const BASE = "http://localhost/api/admin/igdb/backfill-games/stream";

function events(text) {
  return text
    .trim()
    .split("\n\n")
    .map((block) => {
      const [eventLine, dataLine] = block.split("\n");
      return { event: eventLine.replace("event: ", ""), data: JSON.parse(dataLine.replace("data: ", "")) };
    });
}

async function run(url = BASE) {
  const res = await GET(new Request(url));
  return { res, events: events(await res.text()) };
}

const PS1 = { id: "p-ps1", igdbId: 7, yearStart: null, yearEnd: null, parentPlatform: null };
const PC_VARIANT = { id: "p-pc", igdbId: null, yearStart: 1994, yearEnd: 1999, parentPlatform: { igdbId: 6 } };
const ORPHAN_VARIANT = { id: "p-x", igdbId: null, yearStart: null, yearEnd: null, parentPlatform: null };

describe("/api/admin/igdb/backfill-games/stream", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("streams Unauthorized for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });

    const { res, events: ev } = await run();

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(ev).toEqual([{ event: "sync-error", data: { message: "Unauthorized" } }]);
    expect(prisma.game.findMany).not.toHaveBeenCalled();
  });

  test("first page: counts, fetches the stored ids from IGDB and writes each game for its own platforms", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.game.count.mockResolvedValueOnce(3);
    prisma.game.findMany.mockResolvedValueOnce([
      { igdbId: 101, platforms: [PS1, PC_VARIANT] },
      { igdbId: 102, platforms: [PS1, ORPHAN_VARIANT] },
      { igdbId: 103, platforms: [PS1] }
    ]);
    // 103 no longer exists on IGDB.
    const igdbGames = [{ id: 101, name: "A" }, { id: 102, name: "B" }];
    igdbRequest.mockResolvedValueOnce(igdbGames);
    syncIgdbGamePage.mockResolvedValueOnce({ processed: 2, inserted: 0, updated: 2 });

    const { events: ev } = await run(`${BASE}?pageSize=25`);

    expect(prisma.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { igdbId: { gt: 0 } }, orderBy: { igdbId: "asc" }, take: 25 })
    );
    expect(igdbRequest).toHaveBeenCalledTimes(1);
    expect(igdbRequest.mock.calls[0][0]).toBe("games");
    expect(igdbRequest.mock.calls[0][1]).toContain("where id = (101,102,103);");

    const [written, options] = syncIgdbGamePage.mock.calls[0];
    expect(written).toBe(igdbGames);
    expect(options.platformsFor({ id: 101 })).toEqual([
      { platformId: "p-ps1", platformIgdbId: 7, yearStart: undefined, yearEnd: undefined },
      { platformId: "p-pc", platformIgdbId: 6, yearStart: 1994, yearEnd: 1999 }
    ]);
    // A platform with no IGDB id anywhere cannot be matched to release dates, so it is left out.
    expect(options.platformsFor({ id: 102 }).map((p) => p.platformId)).toEqual(["p-ps1"]);
    expect(options.platformsFor({ id: 999 })).toEqual([]);

    expect(ev).toEqual([
      { event: "total", data: { total: 3 } },
      {
        event: "done",
        data: { phase: "backfill", processed: 3, updated: 2, missing: 1, hasMore: false, nextCursor: null, total: 3 }
      }
    ]);
  });

  test("a full page reports the last igdbId as the next cursor and later pages skip the count", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    const stored = Array.from({ length: 25 }, (_, i) => ({ igdbId: 200 + i, platforms: [PS1] }));
    prisma.game.findMany.mockResolvedValueOnce(stored);
    igdbRequest.mockResolvedValueOnce(stored.map((g) => ({ id: g.igdbId, name: "G" })));
    syncIgdbGamePage.mockResolvedValueOnce({ processed: 25, inserted: 0, updated: 25 });

    const { events: ev } = await run(`${BASE}?cursor=150&pageSize=25`);

    expect(prisma.game.count).not.toHaveBeenCalled();
    expect(prisma.game.findMany.mock.calls[0][0].where).toEqual({ igdbId: { gt: 150 } });
    expect(ev).toEqual([
      {
        event: "done",
        data: { phase: "backfill", processed: 25, updated: 25, missing: 0, hasMore: true, nextCursor: 224, total: null }
      }
    ]);
  });

  test("page size defaults to IGDB's maximum and is clamped to 25-500", async () => {
    for (const [query, expected] of [["", 500], ["?pageSize=9999", 500], ["?pageSize=1", 25]]) {
      getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
      prisma.game.count.mockResolvedValueOnce(0);
      prisma.game.findMany.mockResolvedValueOnce([]);

      await run(`${BASE}${query}`);

      expect(prisma.game.findMany.mock.calls.at(-1)[0].take).toBe(expected);
    }
  });

  test("finishes without calling IGDB when nothing is left", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.game.findMany.mockResolvedValueOnce([]);

    const { events: ev } = await run(`${BASE}?cursor=999999`);

    expect(igdbRequest).not.toHaveBeenCalled();
    expect(ev.at(-1).data).toMatchObject({ phase: "backfill", processed: 0, hasMore: false, nextCursor: null });
  });

  test("streams a retryable error when IGDB fails", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.game.count.mockResolvedValueOnce(1);
    prisma.game.findMany.mockResolvedValueOnce([{ igdbId: 101, platforms: [PS1] }]);
    igdbRequest.mockRejectedValueOnce(new Error("IGDB request failed: 503"));

    const { events: ev } = await run();

    expect(ev.at(-1)).toEqual({
      event: "sync-error",
      data: { message: "IGDB request failed: 503", retryable: true }
    });
    expect(syncIgdbGamePage).not.toHaveBeenCalled();
  });
});
