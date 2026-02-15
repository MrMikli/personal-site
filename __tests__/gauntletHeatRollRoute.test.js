import { POST } from "@/app/api/gauntlet/heats/[heatId]/roll/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/heatGuards", () => ({
  ensureHeatIsMutable: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findUnique: jest.fn() },
    gauntlet: { update: jest.fn() },
    heatSignup: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    gamePlatform: { findMany: jest.fn() },
    game: { findMany: jest.fn() },
    heatRoll: { findMany: jest.fn(), create: jest.fn(), aggregate: jest.fn() }
  }
}));

describe("/api/gauntlet/heats/[heatId]/roll", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when not logged in", async () => {
    getSession.mockResolvedValueOnce(null);
    const req = new Request("http://localhost", { method: "POST", body: "{}" });
    const res = await POST(req, { params: { heatId: "h1" } });
    expect(res.status).toBe(401);
  });

  test("returns 404 when heat not found", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });
    prisma.heat.findUnique.mockResolvedValueOnce(null);

    const req = new Request("http://localhost", { method: "POST", body: "{}" });
    const res = await POST(req, { params: { heatId: "h1" } });
    expect(res.status).toBe(404);
  });
});
