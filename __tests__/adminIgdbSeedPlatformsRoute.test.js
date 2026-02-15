import { POST } from "@/app/api/admin/igdb/seed-platforms/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { fetchAllPlatforms } from "@/lib/igdb";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/igdb", () => ({
  fetchAllPlatforms: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    platform: {
      createMany: jest.fn()
    }
  }
}));

describe("/api/admin/igdb/seed-platforms", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });
    const res = await POST();
    expect(res.status).toBe(401);
  });

  test("inserts platforms and returns counts", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    fetchAllPlatforms.mockResolvedValueOnce([
      { id: 1, name: "P1", abbreviation: "P1", generation: 1 },
      { id: 2, name: "P2" }
    ]);
    prisma.platform.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ inserted: 2, totalFetched: 2 });
  });
});
