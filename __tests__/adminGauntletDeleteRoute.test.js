import { DELETE } from "@/app/api/admin/gauntlets/[gauntletId]/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn()
  }
}));

describe("/api/admin/gauntlets/[gauntletId] DELETE", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });

    const res = await DELETE(null, { params: { gauntletId: "g1" } });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
  });

  test("returns 400 when gauntletId missing", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });

    const res = await DELETE(null, { params: {} });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: "Missing gauntletId" });
  });

  test("returns 404 when gauntlet not found", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.$transaction.mockResolvedValueOnce({ notFound: true });

    const res = await DELETE(null, { params: { gauntletId: "missing" } });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ message: "Gauntlet not found" });
  });

  test("deletes dependent records and returns counts", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });

    const tx = {
      gauntlet: {
        findUnique: jest.fn(async () => ({
          id: "g1",
          name: "G",
          heats: [{ id: "h1" }, { id: "h2" }]
        })),
        update: jest.fn(async () => ({ id: "g1" })),
        delete: jest.fn(async () => ({ id: "g1", name: "G" }))
      },
      heatSignup: {
        findMany: jest.fn(async () => [{ id: "s1" }, { id: "s2" }]),
        deleteMany: jest.fn(async () => ({ count: 2 }))
      },
      heatRoll: {
        deleteMany: jest.fn(async () => ({ count: 5 }))
      },
      heatRollWheel: {
        deleteMany: jest.fn(async () => ({ count: 5 }))
      },
      heatEffect: {
        deleteMany: jest.fn(async () => ({ count: 3 }))
      },
      gauntletEffect: {
        deleteMany: jest.fn(async () => ({ count: 7 }))
      },
      heat: {
        deleteMany: jest.fn(async () => ({ count: 2 }))
      }
    };

    prisma.$transaction.mockImplementation(async (fn) => fn(tx));

    const res = await DELETE(null, { params: { gauntletId: "g1" } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toMatchObject({
      notFound: false,
      gauntlet: { id: "g1", name: "G" },
      deleted: {
        heats: 2,
        heatSignups: 2,
        heatRolls: 5,
        heatRollWheels: 5,
        heatEffects: 3,
        gauntletEffects: 7
      }
    });

    expect(tx.gauntlet.findUnique).toHaveBeenCalledWith({
      where: { id: "g1" },
      select: { id: true, name: true, heats: { select: { id: true } } }
    });

    expect(tx.heatSignup.findMany).toHaveBeenCalledWith({
      where: { heatId: { in: ["h1", "h2"] } },
      select: { id: true }
    });

    expect(tx.heatRollWheel.deleteMany).toHaveBeenCalledWith({
      where: { heatRoll: { heatSignupId: { in: ["s1", "s2"] } } }
    });

    expect(tx.heatRoll.deleteMany).toHaveBeenCalledWith({
      where: { heatSignupId: { in: ["s1", "s2"] } }
    });

    expect(tx.heatEffect.deleteMany).toHaveBeenCalledWith({
      where: { heatId: { in: ["h1", "h2"] } }
    });

    expect(tx.gauntletEffect.deleteMany).toHaveBeenCalledWith({ where: { gauntletId: "g1" } });

    expect(tx.heatSignup.deleteMany).toHaveBeenCalledWith({
      where: { heatId: { in: ["h1", "h2"] } }
    });

    expect(tx.gauntlet.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { users: { set: [] } },
      select: { id: true }
    });

    expect(tx.heat.deleteMany).toHaveBeenCalledWith({ where: { gauntletId: "g1" } });
    expect(tx.gauntlet.delete).toHaveBeenCalledWith({
      where: { id: "g1" },
      select: { id: true, name: true }
    });
  });
});
