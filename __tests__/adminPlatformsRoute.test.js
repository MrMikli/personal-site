import { GET, PATCH } from "@/app/api/admin/platforms/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    platform: {
      findMany: jest.fn(),
      update: jest.fn()
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

  test("PATCH returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });

    const req = new Request("http://localhost/api/admin/platforms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformId: "plat_1", rollYearEnd: 1996 })
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  test("PATCH updates rollYearEnd for admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.update.mockResolvedValueOnce({ id: "plat_1", rollYearEnd: 1996 });

    const req = new Request("http://localhost/api/admin/platforms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformId: "plat_1", rollYearEnd: 1996 })
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    expect(prisma.platform.update).toHaveBeenCalledWith({
      where: { id: "plat_1" },
      data: { rollYearEnd: 1996 },
      select: { id: true, rollYearEnd: true }
    });
  });

  test("PATCH allows clearing rollYearEnd", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.platform.update.mockResolvedValueOnce({ id: "plat_1", rollYearEnd: null });

    const req = new Request("http://localhost/api/admin/platforms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformId: "plat_1", rollYearEnd: null })
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    expect(prisma.platform.update).toHaveBeenCalledWith({
      where: { id: "plat_1" },
      data: { rollYearEnd: null },
      select: { id: true, rollYearEnd: true }
    });
  });
});
