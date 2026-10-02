import {
  punishmentDelta,
  sumPoolDelta,
  hasStoredPunishment,
  configuredPool,
  isUnusedBonusRoll,
  gaveUpPreviousHeat
} from "@/lib/heatPool";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findFirst: jest.fn() },
    heatSignup: { findUnique: jest.fn() }
  }
}));

const punish = (poolDelta) => ({ kind: "PUNISH_ROLL_POOL_MINUS_30", poolDelta });
const plus3 = { kind: "REWARD_ROLL_POOL_PLUS_30", poolDelta: 3 };

describe("punishmentDelta", () => {
  test.each([
    [10, -2],
    [3, -2],
    [2, -1],
    [1, 0],
    [0, 0],
    [null, 0],
    ["6", -2]
  ])("base pool %p -> %p", (base, expected) => {
    expect(punishmentDelta(base)).toBe(expected);
  });
});

describe("sumPoolDelta", () => {
  test("no effects", () => {
    expect(sumPoolDelta([], 6)).toEqual({ poolDelta: 0, punishDelta: 0 });
    expect(sumPoolDelta(null, 6)).toEqual({ poolDelta: 0, punishDelta: 0 });
  });

  test("adds rewards and a single punishment", () => {
    expect(sumPoolDelta([plus3, punish(-2)], 6)).toEqual({ poolDelta: 1, punishDelta: -2 });
  });

  test("duplicate punishments never stack", () => {
    expect(sumPoolDelta([punish(-2), punish(-2)], 6)).toEqual({ poolDelta: -2, punishDelta: -2 });
  });

  test("punishment is clamped to the base pool", () => {
    expect(sumPoolDelta([punish(-2)], 2).punishDelta).toBe(-1);
    expect(sumPoolDelta([punish(-2)], 1).punishDelta).toBe(0);
  });

  test("ignores effects without a poolDelta", () => {
    expect(sumPoolDelta([{ kind: "REWARD_BONUS_ROLL_PLATFORM", poolDelta: null }], 6).poolDelta).toBe(0);
  });
});

test("hasStoredPunishment only counts negative punishment rows", () => {
  expect(hasStoredPunishment([punish(-2)])).toBe(true);
  expect(hasStoredPunishment([punish(0), plus3])).toBe(false);
  expect(hasStoredPunishment(undefined)).toBe(false);
});

test("configuredPool never drops below 1", () => {
  expect(configuredPool(6, 3)).toBe(9);
  expect(configuredPool(2, -5)).toBe(1);
});

test("isUnusedBonusRoll", () => {
  const token = { kind: "REWARD_BONUS_ROLL_PLATFORM", remainingUses: 1, consumedAt: null };
  expect(isUnusedBonusRoll(token)).toBe(true);
  expect(isUnusedBonusRoll({ ...token, consumedAt: new Date() })).toBe(false);
  expect(isUnusedBonusRoll({ ...token, remainingUses: 0 })).toBe(false);
  expect(isUnusedBonusRoll(plus3)).toBe(false);
});

describe("gaveUpPreviousHeat", () => {
  beforeEach(() => jest.clearAllMocks());

  test("false without gauntlet or order", async () => {
    await expect(gaveUpPreviousHeat({ gauntletId: null, heatOrder: 2, userId: "u1" })).resolves.toBe(false);
    await expect(gaveUpPreviousHeat({ gauntletId: "g1", heatOrder: undefined, userId: "u1" })).resolves.toBe(false);
    expect(prisma.heat.findFirst).not.toHaveBeenCalled();
  });

  test("false for the first heat", async () => {
    prisma.heat.findFirst.mockResolvedValueOnce(null);
    await expect(gaveUpPreviousHeat({ gauntletId: "g1", heatOrder: 1, userId: "u1" })).resolves.toBe(false);
  });

  test("reads the previous heat's signup status", async () => {
    prisma.heat.findFirst.mockResolvedValue({ id: "h1" });
    prisma.heatSignup.findUnique.mockResolvedValueOnce({ status: "GIVEN_UP" }).mockResolvedValueOnce({ status: "BEATEN" });

    await expect(gaveUpPreviousHeat({ gauntletId: "g1", heatOrder: 2, userId: "u1" })).resolves.toBe(true);
    await expect(gaveUpPreviousHeat({ gauntletId: "g1", heatOrder: 2, userId: "u1" })).resolves.toBe(false);
    expect(prisma.heat.findFirst).toHaveBeenCalledWith({
      where: { gauntletId: "g1", order: { lt: 2 } },
      orderBy: { order: "desc" },
      select: { id: true }
    });
    expect(prisma.heatSignup.findUnique).toHaveBeenCalledWith({
      where: { heatId_userId: { heatId: "h1", userId: "u1" } },
      select: { status: true }
    });
  });
});
