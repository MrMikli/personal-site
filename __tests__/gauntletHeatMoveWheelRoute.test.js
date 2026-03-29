import { POST } from "@/app/api/gauntlet/heats/[heatId]/rolls/[rollId]/move-wheel/route";
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
    $transaction: jest.fn(),
    heatRoll: { findUnique: jest.fn(), findFirst: jest.fn() }
  }
}));

describe("/api/gauntlet/heats/[heatId]/rolls/[rollId]/move-wheel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("wraps move-wheel at array edges (delta -1 from index 0 goes to last)", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });

    prisma.heatRoll.findUnique.mockResolvedValueOnce({
      id: "r1",
      heatSignup: {
        id: "s1",
        userId: "u1",
        heatId: "h1",
        heat: { gauntletId: "g1", gauntlet: { effectsEnabled: true } }
      },
      wheel: {
        chosenIndex: 0,
        gameIds: ["g1", "g2", "g3"],
        platformIds: ["p1", "p1", "p1"]
      }
    });

    prisma.heatRoll.findFirst.mockResolvedValueOnce(null);

    const tx = {
      gauntletEffect: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findUnique: jest.fn().mockResolvedValueOnce({ remainingUses: 3 })
      },
      heatRoll: {
        update: jest.fn().mockResolvedValueOnce({
          id: "r1",
          gameId: "g3",
          platformId: "p1",
          game: { id: "g3", platforms: [] },
          platform: { id: "p1", name: "P1", abbreviation: "P1" }
        })
      },
      heatRollWheel: {
        update: jest.fn().mockResolvedValueOnce({})
      }
    };

    prisma.$transaction.mockImplementationOnce(async (fn) => fn(tx));

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ delta: -1 })
    });

    const res = await POST(req, { params: { heatId: "h1", rollId: "r1" } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json?.chosenIndex).toBe(2);

    expect(tx.heatRollWheel.update).toHaveBeenCalledWith({
      where: { heatRollId: "r1" },
      data: { chosenIndex: 2 }
    });

    expect(tx.heatRoll.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ gameId: "g3" })
      })
    );
  });

  test("rejects a move that would not change selection (e.g. delta 2 on 2-slot wheel)", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });

    prisma.heatRoll.findUnique.mockResolvedValueOnce({
      id: "r1",
      heatSignup: {
        id: "s1",
        userId: "u1",
        heatId: "h1",
        heat: { gauntletId: "g1", gauntlet: { effectsEnabled: true } }
      },
      wheel: {
        chosenIndex: 0,
        gameIds: ["g1", "g2"],
        platformIds: ["p1", "p1"]
      }
    });

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ delta: 2 })
    });

    const res = await POST(req, { params: { heatId: "h1", rollId: "r1" } });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(String(json?.message || "").toLowerCase()).toMatch(/not change selection/);
  });
});
