import { POST } from "@/app/api/admin/heats/[heatId]/powerups/grant/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findUnique: jest.fn() },
    gauntletEffect: { upsert: jest.fn() }
  }
}));

describe("/api/admin/heats/[heatId]/powerups/grant POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });

    const req = { json: async () => ({ kind: "REWARD_ROLL_POOL_PLUS_30" }) };
    const res = await POST(req, { params: { heatId: "h1" } });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
  });

  test("returns 400 for invalid kind", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true, id: "u1" } });

    const req = { json: async () => ({ kind: "NOPE" }) };
    const res = await POST(req, { params: { heatId: "h1" } });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: "Invalid powerup kind" });
  });

  test("returns 404 when heat missing", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true, id: "u1" } });
    prisma.heat.findUnique.mockResolvedValueOnce(null);

    const req = { json: async () => ({ kind: "REWARD_MOVE_WHEEL" }) };
    const res = await POST(req, { params: { heatId: "missing" } });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ message: "Heat not found" });
  });

  test("upserts inventory and returns totals", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true, id: "u1" } });
    prisma.heat.findUnique.mockResolvedValueOnce({ gauntletId: "g1" });
    prisma.gauntletEffect.upsert.mockResolvedValueOnce({ remainingUses: 6 });

    const req = { json: async () => ({ kind: "REWARD_MOVE_WHEEL" }) };
    const res = await POST(req, { params: { heatId: "h1" } });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      kind: "REWARD_MOVE_WHEEL",
      addedUses: 4,
      totalUses: 6
    });

    expect(prisma.gauntletEffect.upsert).toHaveBeenCalledWith({
      where: {
        gauntletId_userId_kind: {
          gauntletId: "g1",
          userId: "u1",
          kind: "REWARD_MOVE_WHEEL"
        }
      },
      create: {
        gauntletId: "g1",
        userId: "u1",
        kind: "REWARD_MOVE_WHEEL",
        remainingUses: 4
      },
      update: {
        remainingUses: { increment: 4 }
      }
    });
  });
});
