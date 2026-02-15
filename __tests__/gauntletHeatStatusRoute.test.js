import { POST } from "@/app/api/gauntlet/heats/[heatId]/status/route";
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
    heatSignup: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }
  }
}));

describe("/api/gauntlet/heats/[heatId]/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when not logged in", async () => {
    getSession.mockResolvedValueOnce(null);
    const req = new Request("http://localhost", { method: "POST", body: "{}" });
    const res = await POST(req, { params: { heatId: "h1" } });
    expect(res.status).toBe(401);
  });

  test("returns 400 on invalid status", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "NOPE" })
    });

    const res = await POST(req, { params: { heatId: "h1" } });
    expect(res.status).toBe(400);
  });

  test("creates signup on first UNBEATEN", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });
    prisma.heat.findUnique.mockResolvedValueOnce({ gauntletId: "g1" });
    prisma.heatSignup.findUnique.mockResolvedValueOnce(null);
    prisma.heatSignup.create.mockResolvedValueOnce({ status: "UNBEATEN" });

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "UNBEATEN" })
    });

    const res = await POST(req, { params: { heatId: "h1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, status: "UNBEATEN" });
  });
});
