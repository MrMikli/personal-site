import { GET } from "@/app/api/admin/igdb/sync-games/by-platform/[platformId]/stream/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { igdbRequest } from "@/lib/igdb";
import { clearPlatformGames, syncIgdbGamePage } from "@/lib/igdbSync";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    platform: { findUnique: jest.fn() }
  }
}));

jest.mock("@/lib/igdbSync", () => ({
  clearPlatformGames: jest.fn(),
  syncIgdbGamePage: jest.fn()
}));

jest.mock("@/lib/igdb", () => ({
  igdbRequest: jest.fn()
}));

const BASE = "http://localhost/api/admin/igdb/sync-games/by-platform/p1/stream";

function events(text) {
  return text
    .trim()
    .split("\n\n")
    .map((block) => {
      const [eventLine, dataLine] = block.split("\n");
      return { event: eventLine.replace("event: ", ""), data: JSON.parse(dataLine.replace("data: ", "")) };
    });
}

async function run(url = BASE, platformId = "p1") {
  const res = await GET(new Request(url), { params: { platformId } });
  return { res, events: events(await res.text()) };
}

describe("/api/admin/igdb/sync-games/by-platform/[platformId]/stream", () => {
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

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(ev).toEqual([{ event: "sync-error", data: { message: "Unauthorized" } }]);
    expect(prisma.platform.findUnique).not.toHaveBeenCalled();
  });

  test("explains when the admin is masked", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false, isAdminActual: true, isAdminMasked: true } });

    const { events: ev } = await run();

    expect(ev[0].event).toBe("sync-error");
    expect(ev[0].data.message).toContain("masked");
  });

  test("streams Platform not found", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce(null);

    const { events: ev } = await run();

    expect(ev).toEqual([{ event: "sync-error", data: { message: "Platform not found" } }]);
  });

  test("refuses a variant with no IGDB id on it or its parent", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce({ id: "p1", igdbId: null, parentPlatform: null });

    const { events: ev } = await run();

    expect(ev[0].event).toBe("sync-error");
    expect(ev[0].data.message).toContain("no IGDB ID");
    expect(igdbRequest).not.toHaveBeenCalled();
  });

  test("syncs a page using the parent's IGDB id and writes it in one call", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce({
      id: "p1",
      igdbId: null,
      yearStart: 1994,
      yearEnd: 1999,
      parentPlatform: { igdbId: 6 }
    });
    const games = [
      { id: 101, name: "New Game", slug: "new-game", release_dates: [{ date: 820454400, platform: 6, release_region: 2 }] },
      { id: 102, name: "Old Game", release_dates: [] }
    ];
    igdbRequest.mockResolvedValueOnce([{ count: 2 }]).mockResolvedValueOnce(games);
    syncIgdbGamePage.mockResolvedValueOnce({ processed: 2, inserted: 1, updated: 1 });

    const { events: ev } = await run(`${BASE}?pageSize=50`);

    const [countCall, gamesCall] = igdbRequest.mock.calls;
    expect(countCall[0]).toBe("games/count");
    expect(gamesCall[0]).toBe("games");
    expect(gamesCall[1]).toContain("release_dates.platform = 6");
    expect(gamesCall[1]).toContain("limit 50;");

    expect(syncIgdbGamePage).toHaveBeenCalledTimes(1);
    const [writtenGames, options] = syncIgdbGamePage.mock.calls[0];
    expect(writtenGames).toBe(games);
    // The variant reads release dates through its parent's IGDB id, limited to its year range.
    expect(options.platformsFor(games[0])).toEqual([
      { platformId: "p1", platformIgdbId: 6, yearStart: 1994, yearEnd: 1999 }
    ]);

    expect(ev[0]).toEqual({ event: "total", data: { total: 2 } });
    expect(ev.at(-1)).toMatchObject({
      event: "done",
      data: { phase: "sync", processed: 2, inserted: 1, updated: 1, hasMore: false, nextOffset: null, total: 2 }
    });
  });

  test("later chunks skip the IGDB count and report the next offset", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce({ id: "p1", igdbId: 7, parentPlatform: null });
    const games = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Game ${i + 1}` }));
    igdbRequest.mockResolvedValueOnce(games);
    syncIgdbGamePage.mockResolvedValueOnce({ processed: 25, inserted: 0, updated: 25 });

    const { events: ev } = await run(`${BASE}?offset=25&pageSize=25`);

    expect(igdbRequest).toHaveBeenCalledTimes(1);
    expect(igdbRequest.mock.calls[0][0]).toBe("games");
    expect(igdbRequest.mock.calls[0][1]).toContain("offset 25;");
    expect(ev.map((e) => e.event)).toEqual(["progress", "done"]);
    expect(ev.at(-1).data).toMatchObject({ hasMore: true, nextOffset: 50, total: null });
  });

  test("clear mode clears in one call without asking IGDB", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce({ id: "p1", igdbId: 7, parentPlatform: null });
    clearPlatformGames.mockResolvedValueOnce({ deleted: 3, disconnected: 2, skipped: 1 });

    const { events: ev } = await run(`${BASE}?clear=true`);

    expect(clearPlatformGames).toHaveBeenCalledWith("p1");
    expect(igdbRequest).not.toHaveBeenCalled();
    expect(syncIgdbGamePage).not.toHaveBeenCalled();
    expect(ev.at(-1)).toEqual({
      event: "done",
      data: {
        phase: "clear",
        clear: { processed: 6, deleted: 3, disconnected: 2, skipped: 1, nextCursor: null, done: true }
      }
    });
  });

  test("streams an error when IGDB fails mid-sync", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce({ id: "p1", igdbId: 7, parentPlatform: null });
    igdbRequest.mockResolvedValueOnce([{ count: 5 }]).mockRejectedValueOnce(new Error("IGDB request failed: 429"));

    const { events: ev } = await run();

    expect(ev.at(-1)).toEqual({
      event: "sync-error",
      data: { message: "IGDB request failed: 429", retryable: true }
    });
  });
});
