import { GET } from "@/app/api/admin/igdb/sync-games/[platformIgdbId]/stream/route";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

// Keep prisma/igdb modules from doing real work.
jest.mock("@/lib/prisma", () => ({
  prisma: {
    platform: { findUnique: jest.fn() },
    game: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    gamePlatform: { deleteMany: jest.fn(), upsert: jest.fn() }
  }
}));

jest.mock("@/lib/igdb", () => ({
  igdbRequest: jest.fn(async () => [])
}));

describe("/api/admin/igdb/sync-games/[platformIgdbId]/stream", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("streams Unauthorized error for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });

    const req = new Request("http://localhost/api/admin/igdb/sync-games/48/stream");
    const res = await GET(req, { params: { platformIgdbId: "48" } });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("event: error");
    expect(text).toContain("Unauthorized");
  });

  test("streams invalid platform ID error", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });

    const req = new Request("http://localhost/api/admin/igdb/sync-games/nope/stream");
    const res = await GET(req, { params: { platformIgdbId: "nope" } });

    const text = await res.text();
    expect(text).toContain("Invalid platform ID");
  });
});
