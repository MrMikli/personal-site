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
    heat: { findUnique: jest.fn(), findFirst: jest.fn() },
    gauntlet: { update: jest.fn() },
    heatSignup: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    heatEffect: { findMany: jest.fn() },
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

  test("does not block rolling when a BONUS roll exists", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });
    prisma.heat.findUnique.mockResolvedValueOnce({
      id: "h1",
      gauntletId: "g1",
      defaultGameCounter: 10,
      gauntlet: { effectsEnabled: true },
      platforms: [{ id: "p1", name: "Platform 1", abbreviation: "P1" }]
    });

    prisma.gauntlet.update.mockResolvedValueOnce({});
    prisma.heatSignup.findUnique.mockResolvedValueOnce({
      id: "s1",
      heatId: "h1",
      userId: "u1",
      platformTargets: { p1: 9 },
      westernRequired: 0
    });

    const existing = [
      ...Array.from({ length: 9 }).map((_, idx) => ({
        id: `rN${idx + 1}`,
        order: idx + 1,
        source: "NORMAL",
        bonusHeatEffectId: null,
        platformId: "p1",
        gameId: `gN${idx + 1}`,
        game: { hasWesternRelease: false }
      })),
      {
        id: "rB1",
        order: 10,
        source: "BONUS",
        bonusHeatEffectId: "he1",
        platformId: "p1",
        gameId: "gB1",
        game: { hasWesternRelease: false }
      }
    ];

    prisma.heatRoll.findMany.mockResolvedValueOnce(existing);
    prisma.heatEffect.findMany.mockResolvedValueOnce([]);
    prisma.gamePlatform.findMany.mockResolvedValueOnce([]);

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ platformTargets: { p1: 9 }, westernRequired: 0 })
    });

    const res = await POST(req, { params: { heatId: "h1" } });
    const json = await res.json();

    // With a BONUS roll already present, we should not hit the "All rolls used" gate.
    // This request can still fail later due to platform target remaining=0.
    expect(res.status).toBe(400);
    expect(String(json?.message || "")).toMatch(/No remaining rolls available/i);
    expect(String(json?.message || "")).not.toMatch(/All rolls for this heat have been used/i);
  });

  test("clamps punishment so it cannot stack below -2", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });

    prisma.heat.findUnique.mockResolvedValueOnce({
      id: "h1",
      gauntletId: "g1",
      defaultGameCounter: 10,
      gauntlet: { effectsEnabled: true },
      platforms: [{ id: "p1", name: "Platform 1", abbreviation: "P1" }]
    });

    prisma.gauntlet.update.mockResolvedValueOnce({});
    prisma.heatSignup.findUnique.mockResolvedValueOnce({
      id: "s1",
      heatId: "h1",
      userId: "u1",
      platformTargets: { p1: 6 },
      westernRequired: 0
    });

    prisma.heatRoll.findMany.mockResolvedValueOnce(
      Array.from({ length: 6 }).map((_, idx) => ({
        id: `r${idx + 1}`,
        order: idx + 1,
        source: "NORMAL",
        bonusHeatEffectId: null,
        platformId: "p1",
        gameId: `g${idx + 1}`,
        game: { hasWesternRelease: false }
      }))
    );

    // Three duplicate punishments would sum to -6 without clamping.
    prisma.heatEffect.findMany.mockResolvedValueOnce([
      { id: "e1", kind: "PUNISH_ROLL_POOL_MINUS_30", poolDelta: -2, platformId: null, remainingUses: 1, consumedAt: null },
      { id: "e2", kind: "PUNISH_ROLL_POOL_MINUS_30", poolDelta: -2, platformId: null, remainingUses: 1, consumedAt: null },
      { id: "e3", kind: "PUNISH_ROLL_POOL_MINUS_30", poolDelta: -2, platformId: null, remainingUses: 1, consumedAt: null }
    ]);

    prisma.gamePlatform.findMany.mockResolvedValueOnce([]);

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ platformTargets: { p1: 6 }, westernRequired: 0 })
    });

    const res = await POST(req, { params: { heatId: "h1" } });
    const json = await res.json();

    // If punishments stack, configuredPool becomes 4 and we'd take the BONUS roll path,
    // which would fail with "No bonus rolls available".
    expect(res.status).toBe(400);
    expect(String(json?.message || "")).toMatch(/No remaining rolls available for configured platform targets/i);
    expect(String(json?.message || "")).not.toMatch(/No bonus rolls available/i);
  });

  test("applies virtual -2 penalty when previous heat was GIVEN_UP but punishment row is missing", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });

    prisma.heat.findUnique.mockResolvedValueOnce({
      id: "h2",
      gauntletId: "g1",
      order: 2,
      defaultGameCounter: 10,
      gauntlet: { effectsEnabled: true },
      platforms: [{ id: "p1", name: "Platform 1", abbreviation: "P1" }]
    });

    prisma.gauntlet.update.mockResolvedValueOnce({});
    prisma.heatSignup.findUnique
      .mockResolvedValueOnce({
        id: "s2",
        heatId: "h2",
        userId: "u1",
        platformTargets: { p1: 10 },
        westernRequired: 0
      })
      .mockResolvedValueOnce({ status: "GIVEN_UP" });

    prisma.heatRoll.findMany.mockResolvedValueOnce(
      Array.from({ length: 8 }).map((_, idx) => ({
        id: `r${idx + 1}`,
        order: idx + 1,
        source: "NORMAL",
        bonusHeatEffectId: null,
        platformId: "p1",
        gameId: `g${idx + 1}`,
        game: { hasWesternRelease: false }
      }))
    );

    // No stored punishment effect due to earlier bad heat pool data.
    prisma.heatEffect.findMany.mockResolvedValueOnce([]);

    prisma.heat.findFirst.mockResolvedValueOnce({ id: "h1" });

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ platformTargets: { p1: 10 }, westernRequired: 0 })
    });

    const res = await POST(req, { params: { heatId: "h2" } });
    const json = await res.json();

    // With the virtual -2 applied, configuredPool becomes 8, so 8 existing rolls
    // should already exhaust the roll allowance.
    expect(res.status).toBe(400);
    expect(String(json?.message || "")).toMatch(/All rolls for this heat have been used/i);
  });
});
