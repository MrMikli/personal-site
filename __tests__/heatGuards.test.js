import { ensureHeatIsMutable } from "@/lib/heatGuards";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findUnique: jest.fn(), findFirst: jest.fn() },
    gauntlet: { findFirst: jest.fn() },
    heatSignup: { findFirst: jest.fn(), findUnique: jest.fn() }
  }
}));

describe("lib/heatGuards ensureHeatIsMutable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
