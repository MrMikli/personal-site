import { GET, POST } from "@/app/api/admin/gauntlets/[gauntletId]/heats/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    heat: {
      findMany: jest.fn(),
      create: jest.fn()
    }
  }
}));

describe("/api/admin/gauntlets/[gauntletId]/heats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });
    const res = await GET(null, { params: { gauntletId: "g1" } });
    expect(res.status).toBe(401);
  });

  test("GET returns 400 when gauntletId missing", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    const res = await GET(null, { params: {} });
    expect(res.status).toBe(400);
  });

  test("POST validates dates and counter", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });

    const req = new Request("http://localhost/api/admin/gauntlets/g1/heats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: 1 })
    });

    const res = await POST(req, { params: { gauntletId: "g1" } });
    expect(res.status).toBe(400);
  });

  test("POST creates heat", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.heat.create.mockResolvedValueOnce({ id: "h1" });

    const req = new Request("http://localhost/api/admin/gauntlets/g1/heats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Heat",
        order: 1,
        startsAt: "2026-02-01",
        endsAt: "2026-02-02",
        defaultGameCounter: 3,
        platformIds: ["p1"]
      })
    });

    const res = await POST(req, { params: { gauntletId: "g1" } });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ heat: { id: "h1" } });
  });
});
