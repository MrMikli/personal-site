import { DELETE } from "@/app/api/gauntlet/heats/[heatId]/rolls/[rollId]/route";
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
    heatRoll: { findUnique: jest.fn() },
    heatEffect: { updateMany: jest.fn() }
  }
}));

describe("/api/gauntlet/heats/[heatId]/rolls/[rollId] DELETE", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when not logged in", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await DELETE(null, { params: { heatId: "h1", rollId: "r1" } });
    expect(res.status).toBe(401);
  });

  test("deletes roll when owned by user", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });
    prisma.heatRoll.findUnique.mockResolvedValueOnce({
      id: "r1",
      source: "NORMAL",
      bonusHeatEffectId: null,
      heatSignup: { heatId: "h1", userId: "u1" }
    });

    const tx = {
      heatRoll: { delete: jest.fn().mockResolvedValueOnce({}) },
      heatEffect: { updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }) }
    };
    prisma.$transaction.mockImplementationOnce(async (fn) => fn(tx));

    const res = await DELETE(null, { params: { heatId: "h1", rollId: "r1" } });
    expect(res.status).toBe(200);
    expect(tx.heatRoll.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
    expect(tx.heatEffect.updateMany).not.toHaveBeenCalled();
  });

  test("refunds bonus token when deleting a BONUS roll", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });
    prisma.heatRoll.findUnique.mockResolvedValueOnce({
      id: "rB1",
      source: "BONUS",
      bonusHeatEffectId: "he1",
      heatSignup: { heatId: "h1", userId: "u1" }
    });

    const tx = {
      heatRoll: { delete: jest.fn().mockResolvedValueOnce({}) },
      heatEffect: { updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }) }
    };
    prisma.$transaction.mockImplementationOnce(async (fn) => fn(tx));

    const res = await DELETE(null, { params: { heatId: "h1", rollId: "rB1" } });
    expect(res.status).toBe(200);
    expect(tx.heatRoll.delete).toHaveBeenCalledWith({ where: { id: "rB1" } });
    expect(tx.heatEffect.updateMany).toHaveBeenCalledWith({
      where: {
        id: "he1",
        heatId: "h1",
        userId: "u1",
        kind: "REWARD_BONUS_ROLL_PLATFORM"
      },
      data: { remainingUses: 1, consumedAt: null }
    });
  });
});
