import { DELETE } from "@/app/api/admin/users/[userId]/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    heatRoll: { deleteMany: jest.fn() },
    heatSignup: { deleteMany: jest.fn() },
    $transaction: jest.fn()
  }
}));

describe("/api/admin/users/[userId] DELETE", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });
    const res = await DELETE(null, { params: { userId: "u1" } });
    expect(res.status).toBe(401);
  });

  test("returns 400 for invalid params", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    const res = await DELETE(null, { params: { userId: "" } });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: "Invalid user id" });
  });

  test("cannot delete currently logged-in user", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true, id: "u1" } });
    const res = await DELETE(null, { params: { userId: "u1" } });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: expect.stringContaining("cannot delete") });
  });

  test("returns 404 when user not found", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true, id: "admin" } });
    prisma.user.findUnique.mockResolvedValueOnce(null);

    const res = await DELETE(null, { params: { userId: "missing" } });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ message: "User not found" });
  });

  test("deletes user via transaction and returns deleted user", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true, id: "admin" } });
    prisma.user.findUnique.mockResolvedValueOnce({ id: "u2", username: "bob" });

    const tx = {
      heatRoll: { deleteMany: jest.fn(async () => ({ count: 1 })) },
      heatSignup: { deleteMany: jest.fn(async () => ({ count: 1 })) },
      user: {
        update: jest.fn(async () => ({ id: "u2" })),
        delete: jest.fn(async () => ({ id: "u2" }))
      }
    };

    prisma.$transaction.mockImplementationOnce(async (fn) => fn(tx));

    const res = await DELETE(null, { params: { userId: "u2" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, deletedUser: { id: "u2", username: "bob" } });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { gauntlets: { set: [] } },
      select: { id: true }
    });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "u2" } });
  });
});
