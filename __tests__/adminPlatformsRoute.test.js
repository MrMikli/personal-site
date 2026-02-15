import { GET } from "@/app/api/admin/platforms/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    platform: {
      findMany: jest.fn()
    }
  }
}));

describe("/api/admin/platforms", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });

    const req = new Request("http://localhost/api/admin/platforms");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("passes hasGames filter when requested", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.findMany.mockResolvedValueOnce([]);

    const req = new Request("http://localhost/api/admin/platforms?hasGames=true");
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(prisma.platform.findMany).toHaveBeenCalledWith({
      where: { games: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, abbreviation: true }
    });
  });
});
