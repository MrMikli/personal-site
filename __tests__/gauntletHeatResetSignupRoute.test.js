import { POST } from "@/app/api/gauntlet/heats/[heatId]/reset-signup/route";
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
    heatSignup: { findUnique: jest.fn(), update: jest.fn() },
    heatRoll: { deleteMany: jest.fn() },
    $transaction: jest.fn()
  }
}));

describe("/api/gauntlet/heats/[heatId]/reset-signup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when not logged in", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await POST(null, { params: { heatId: "h1" } });
    expect(res.status).toBe(401);
  });

  test("returns 403 when not admin", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1", isAdmin: false } });
    const res = await POST(null, { params: { heatId: "h1" } });
    expect(res.status).toBe(403);
  });

  test("returns success when no signup exists", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1", isAdmin: true } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });
    prisma.heatSignup.findUnique.mockResolvedValueOnce(null);

    const res = await POST(null, { params: { heatId: "h1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });
});
