import { POST, DELETE } from "@/app/api/gauntlet/heats/[heatId]/selected-game/route";
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
    heatRoll: { findUnique: jest.fn() },
    heatSignup: { findUnique: jest.fn(), update: jest.fn() }
  }
}));

describe("/api/gauntlet/heats/[heatId]/selected-game", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST returns 401 when not logged in", async () => {
    getSession.mockResolvedValueOnce(null);
    const req = new Request("http://localhost", { method: "POST", body: "{}" });
    const res = await POST(req, { params: { heatId: "h1" } });
    expect(res.status).toBe(401);
  });

  test("POST selects game for own roll", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });
    prisma.heatRoll.findUnique.mockResolvedValueOnce({
      id: "r1",
      gameId: "g1",
      heatSignup: { id: "s1", heatId: "h1", userId: "u1" },
      game: { id: "g1" }
    });
    prisma.heatSignup.update.mockResolvedValueOnce({ id: "s1", selectedGameId: "g1" });

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rollId: "r1" })
    });

    const res = await POST(req, { params: { heatId: "h1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, selectedGameId: "g1" });
  });

  test("DELETE returns 400 when nothing to undo", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });
    prisma.heatSignup.findUnique.mockResolvedValueOnce(null);

    const res = await DELETE(null, { params: { heatId: "h1" } });
    expect(res.status).toBe(400);
  });
});
