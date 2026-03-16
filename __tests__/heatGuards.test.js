import { ensureHeatIsMutable } from "@/lib/heatGuards";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findUnique: jest.fn(), findFirst: jest.fn() },
    gauntlet: { findFirst: jest.fn() },
    heatSignup: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    heatEffect: { deleteMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn((ops) => Promise.all(ops))
  }
}));

describe("lib/heatGuards ensureHeatIsMutable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("returns 400 when heatId missing", async () => {
    const res = await ensureHeatIsMutable("", { userId: "u1" });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  test("returns 404 when heat not found", async () => {
    prisma.heat.findUnique.mockResolvedValueOnce(null);
    const res = await ensureHeatIsMutable("h1", { userId: "u1" });
    expect(res).toMatchObject({ ok: false, status: 404 });
  });

  test("returns 403 when user not a gauntlet member and no legacy signup", async () => {
    prisma.heat.findUnique.mockResolvedValueOnce({
      id: "h1",
      gauntletId: "g1",
      order: 1,
      startsAt: null,
      endsAt: null
    });
    prisma.gauntlet.findFirst.mockResolvedValueOnce(null);
    prisma.heatSignup.findFirst.mockResolvedValueOnce(null);

    const res = await ensureHeatIsMutable("h1", { userId: "u1" });
    expect(res).toMatchObject({ ok: false, status: 403 });
  });

  test("auto-marks previous heat as GIVEN_UP after its deadline so the next heat is mutable", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    prisma.heat.findUnique.mockResolvedValueOnce({
      id: "h2",
      gauntletId: "g1",
      order: 2,
      startsAt: "2026-03-15",
      endsAt: "2026-03-22",
      defaultGameCounter: 5,
      gauntlet: { effectsEnabled: true }
    });

    prisma.gauntlet.findFirst.mockResolvedValueOnce({ id: "g1" });

    prisma.heat.findFirst.mockResolvedValueOnce({
      id: "h1",
      endsAt: "2026-03-08"
    });

    prisma.heatSignup.findUnique.mockResolvedValueOnce({ status: "UNBEATEN" });
    prisma.heatSignup.upsert.mockResolvedValueOnce({ status: "GIVEN_UP" });
    prisma.heatEffect.deleteMany.mockResolvedValueOnce({ count: 0 });
    prisma.heatEffect.create.mockResolvedValueOnce({ id: "e1" });

    const res = await ensureHeatIsMutable("h2", { userId: "u1" });
    expect(res).toMatchObject({ ok: true });
    expect(prisma.heatSignup.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { heatId_userId: { heatId: "h1", userId: "u1" } },
        update: { status: "GIVEN_UP" }
      })
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  test("auto-timeout creates a punishment effect on the current heat", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    prisma.heat.findUnique.mockResolvedValueOnce({
      id: "h2",
      gauntletId: "g1",
      order: 2,
      startsAt: "2026-03-15",
      endsAt: "2026-03-22",
      defaultGameCounter: 5,
      gauntlet: { effectsEnabled: true }
    });

    prisma.gauntlet.findFirst.mockResolvedValueOnce({ id: "g1" });
    prisma.heat.findFirst.mockResolvedValueOnce({ id: "h1", endsAt: "2026-03-08" });
    prisma.heatSignup.findUnique.mockResolvedValueOnce({ status: "UNBEATEN" });
    prisma.heatSignup.upsert.mockResolvedValueOnce({ status: "GIVEN_UP" });
    prisma.heatEffect.deleteMany.mockResolvedValueOnce({ count: 0 });
    prisma.heatEffect.create.mockResolvedValueOnce({ id: "e1", poolDelta: -2 });

    const res = await ensureHeatIsMutable("h2", { userId: "u1" });
    expect(res).toMatchObject({ ok: true });
    expect(prisma.heatEffect.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { heatId: "h2", userId: "u1", kind: "PUNISH_ROLL_POOL_MINUS_30" }
      })
    );
    expect(prisma.heatEffect.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          heatId: "h2",
          userId: "u1",
          kind: "PUNISH_ROLL_POOL_MINUS_30",
          poolDelta: -2
        })
      })
    );
  });
});
