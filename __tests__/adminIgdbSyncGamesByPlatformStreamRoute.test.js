import { GET } from "@/app/api/admin/igdb/sync-games/by-platform/[platformId]/stream/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { igdbRequest } from "@/lib/igdb";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    platform: { findUnique: jest.fn() },
    game: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    gamePlatform: { deleteMany: jest.fn(), upsert: jest.fn() }
  }
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
    expect(ev).toEqual([{ event: "error", data: { message: "Unauthorized" } }]);
    expect(prisma.platform.findUnique).not.toHaveBeenCalled();
  });

  test("explains when the admin is masked", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false, isAdminActual: true, isAdminMasked: true } });

    const { events: ev } = await run();

    expect(ev[0].event).toBe("error");
    expect(ev[0].data.message).toContain("masked");
  });

  test("streams Platform not found", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce(null);

    const { events: ev } = await run();

    expect(ev).toEqual([{ event: "error", data: { message: "Platform not found" } }]);
  });

  test("refuses a variant with no IGDB id on it or its parent", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce({ id: "p1", igdbId: null, parentPlatform: null });

    const { events: ev } = await run();

    expect(ev[0].event).toBe("error");
    expect(ev[0].data.message).toContain("no IGDB ID");
    expect(igdbRequest).not.toHaveBeenCalled();
  });

  test("syncs a page using the parent's IGDB id: inserts new games and updates existing ones", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce({
      id: "p1",
      igdbId: null,
      yearStart: 1994,
      yearEnd: 1999,
      parentPlatform: { igdbId: 6 }
    });
    igdbRequest
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([
        {
          id: 101,
          name: "New Game",
          slug: "new-game",
          cover: { url: "//images.igdb.com/igdb/image/upload/t_thumb/abc.jpg" },
          release_dates: [{ date: 820454400, human: "1996", platform: 6, release_region: 2 }]
        },
        { id: 102, name: "Old Game", release_dates: [] }
      ]);
    prisma.game.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "g2", platforms: [{ id: "p1" }] });
    prisma.game.create.mockResolvedValueOnce({ id: "g1" });

    const { events: ev } = await run(`${BASE}?pageSize=50`);

    const [countCall, gamesCall] = igdbRequest.mock.calls;
    expect(countCall[0]).toBe("games/count");
    expect(gamesCall[0]).toBe("games");
    expect(gamesCall[1]).toContain("release_dates.platform = 6");
    expect(gamesCall[1]).toContain("limit 50;");

    expect(prisma.game.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          igdbId: 101,
          coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg",
          hasWesternRelease: true,
          platforms: { connect: { id: "p1" } }
        })
      })
    );
    expect(prisma.gamePlatform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { gameId: "g1", platformId: "p1", hasWesternRelease: true } })
    );
    // Already linked to this platform: updated, but not connected again.
    expect(prisma.game.update).toHaveBeenCalledTimes(1);

    expect(ev[0]).toEqual({ event: "total", data: { total: 2 } });
    expect(ev.at(-1)).toMatchObject({
      event: "done",
      data: { phase: "sync", processed: 2, inserted: 1, updated: 1, hasMore: false, nextOffset: null }
    });
  });

  test("clear mode deletes single-platform games and unlinks shared ones", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce({ id: "p1", igdbId: 7, parentPlatform: null });
    igdbRequest.mockResolvedValueOnce([{ count: 0 }]);
    prisma.game.findMany.mockResolvedValueOnce([
      { id: "g1", platforms: [{ id: "p1" }] },
      { id: "g2", platforms: [{ id: "p1" }, { id: "p2" }] }
    ]);

    const { events: ev } = await run(`${BASE}?clear=true`);

    expect(prisma.game.delete).toHaveBeenCalledWith({ where: { id: "g1" } });
    expect(prisma.game.update).toHaveBeenCalledWith({
      where: { id: "g2" },
      data: { platforms: { disconnect: { id: "p1" } } }
    });
    expect(prisma.gamePlatform.deleteMany).toHaveBeenCalledWith({ where: { gameId: "g2", platformId: "p1" } });
    expect(ev.at(-1)).toMatchObject({
      event: "done",
      data: { phase: "clear", clear: { deleted: 1, disconnected: 1, done: true } }
    });
  });

  test("streams an error when IGDB fails mid-sync", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce({ id: "p1", igdbId: 7, parentPlatform: null });
    igdbRequest.mockResolvedValueOnce([{ count: 5 }]).mockRejectedValueOnce(new Error("IGDB request failed: 429"));

    const { events: ev } = await run();

    expect(ev.at(-1)).toEqual({ event: "error", data: { message: "IGDB request failed: 429" } });
  });
});
