import { POST } from "@/app/api/admin/igdb/sync-games/[platformIgdbId]/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { igdbRequest } from "@/lib/igdb";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/igdb", () => ({
  igdbRequest: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    platform: { findUnique: jest.fn() },
    game: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    gamePlatform: { upsert: jest.fn() }
  }
}));

describe("/api/admin/igdb/sync-games/[platformIgdbId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });
    const res = await POST(null, { params: { platformIgdbId: "48" } });
    expect(res.status).toBe(401);
  });

  test("returns 400 for invalid platform ID", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    const res = await POST(null, { params: { platformIgdbId: "nope" } });
    expect(res.status).toBe(400);
  });

  test("returns 404 when platform not found", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce(null);

    const res = await POST(null, { params: { platformIgdbId: "48" } });
    expect(res.status).toBe(404);
  });

  test("returns processed counts with empty IGDB response", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findUnique.mockResolvedValueOnce({ id: "p1" });
    igdbRequest.mockResolvedValueOnce([]);

    const res = await POST(null, { params: { platformIgdbId: "48" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ processed: 0, inserted: 0, updated: 0 });
  });
});
