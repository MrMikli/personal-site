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
    heat: { findUnique: jest.fn(), findFirst: jest.fn() },
    gauntlet: { update: jest.fn() },
    heatSignup: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    gauntletEffect: { upsert: jest.fn() },
    heatEffect: { create: jest.fn() }
  }
}));

describe("/api/gauntlet/heats/[heatId]/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  test("awards a reward powerup on BEATEN transition", async () => {
    jest.spyOn(global.Math, "random").mockReturnValue(0.6); // -> powerup #3

    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });

    // heat lookup (also used for gauntlet membership sync + reward)
    prisma.heat.findUnique.mockResolvedValueOnce({
      gauntletId: "g1",
      order: 1,
      defaultGameCounter: 10,
      gauntlet: { effectsEnabled: true }
    });
    prisma.gauntlet.update.mockResolvedValueOnce({});

    prisma.heatSignup.findUnique.mockResolvedValueOnce({
      id: "s1",
      status: "UNBEATEN",
      selectedGameId: "game1"
    });
    prisma.heatSignup.update.mockResolvedValueOnce({ status: "BEATEN" });

    prisma.gauntletEffect.upsert.mockResolvedValueOnce({ remainingUses: 4 });

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "BEATEN" })
    });

    const res = await POST(req, { params: { heatId: "h1" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, status: "BEATEN" });
    expect(json.reward).toMatchObject({
      powerupNumber: 3,
      kind: "REWARD_MOVE_WHEEL",
      addedUses: 4,
      totalUses: 4
    });
  });

  test("creates a next-heat punishment on GIVEN_UP transition", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });

    // heat lookup (also used for gauntlet membership sync + punishment)
    prisma.heat.findUnique.mockResolvedValueOnce({
      gauntletId: "g1",
      order: 1,
      defaultGameCounter: 10,
      gauntlet: { effectsEnabled: true }
    });
    prisma.gauntlet.update.mockResolvedValueOnce({});

    prisma.heatSignup.findUnique.mockResolvedValueOnce({
      id: "s1",
      status: "UNBEATEN",
      selectedGameId: "game1"
    });
    prisma.heatSignup.update.mockResolvedValueOnce({ status: "GIVEN_UP" });

    prisma.heat.findFirst.mockResolvedValueOnce({
      id: "h2",
      order: 2,
      name: "Week 2",
      defaultGameCounter: 10
    });
    prisma.heatEffect.create.mockResolvedValueOnce({ id: "he1" });

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "GIVEN_UP" })
    });

    const res = await POST(req, { params: { heatId: "h1" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, status: "GIVEN_UP" });
    expect(json.punishment).toMatchObject({
      kind: "PUNISH_ROLL_POOL_MINUS_30",
      nextHeat: { id: "h2", order: 2, name: "Week 2" },
      nextRollPool: 8
    });
  });
});
