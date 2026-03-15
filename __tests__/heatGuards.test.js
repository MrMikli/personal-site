import { ensureHeatIsMutable } from "@/lib/heatGuards";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findUnique: jest.fn(), findFirst: jest.fn() },
    gauntlet: { findFirst: jest.fn() },
    heatSignup: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() }
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
      endsAt: "2026-03-22"
    });

    prisma.gauntlet.findFirst.mockResolvedValueOnce({ id: "g1" });

    prisma.heat.findFirst.mockResolvedValueOnce({
      id: "h1",
      endsAt: "2026-03-08"
    });

    prisma.heatSignup.findUnique.mockResolvedValueOnce({ status: "UNBEATEN" });
    prisma.heatSignup.upsert.mockResolvedValueOnce({ status: "GIVEN_UP" });

    const res = await ensureHeatIsMutable("h2", { userId: "u1" });
    expect(res).toMatchObject({ ok: true });
    expect(prisma.heatSignup.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { heatId_userId: { heatId: "h1", userId: "u1" } },
        update: { status: "GIVEN_UP" }
      })
    );
  });
});
