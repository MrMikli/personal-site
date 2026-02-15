import { PATCH, DELETE } from "@/app/api/admin/gauntlets/[gauntletId]/heats/[heatId]/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    heat: {
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn()
    },
    $transaction: jest.fn(),
    heatSignup: { findMany: jest.fn(), deleteMany: jest.fn() },
    heatRoll: { findMany: jest.fn(), deleteMany: jest.fn() },
    heatRollWheel: { deleteMany: jest.fn() },
    heatEffect: { deleteMany: jest.fn() }
  }
}));

describe("/api/admin/gauntlets/[gauntletId]/heats/[heatId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("PATCH returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });
    const req = new Request("http://localhost", { method: "PATCH", body: "{}" });
    const res = await PATCH(req, { params: { gauntletId: "g1", heatId: "h1" } });
    expect(res.status).toBe(401);
  });

  test("PATCH returns 400 with no fields", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const res = await PATCH(req, { params: { gauntletId: "g1", heatId: "h1" } });
    expect(res.status).toBe(400);
  });

  test("PATCH returns 404 when heat missing", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.heat.findFirst.mockResolvedValueOnce(null);

    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" })
    });
    const res = await PATCH(req, { params: { gauntletId: "g1", heatId: "h1" } });
    expect(res.status).toBe(404);
  });

  test("DELETE returns 404 when nothing deleted", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.$transaction.mockResolvedValueOnce({ notFound: true });

    const res = await DELETE(null, { params: { gauntletId: "g1", heatId: "h1" } });
    expect(res.status).toBe(404);
  });

  test("DELETE returns deleted count", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.$transaction.mockResolvedValueOnce({
      notFound: false,
      heat: { id: "h1" },
      deleted: { heatEffects: 0, heatSignups: 0, heatRolls: 0, heatRollWheels: 0 }
    });

    const res = await DELETE(null, { params: { gauntletId: "g1", heatId: "h1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      notFound: false,
      heat: { id: "h1" },
      deleted: { heatEffects: 0, heatSignups: 0, heatRolls: 0, heatRollWheels: 0 }
    });
  });
});
