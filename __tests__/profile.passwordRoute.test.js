import { POST } from "@/app/api/profile/[userId]/password/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import bcrypt from "bcryptjs";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn()
    }
  }
}));

jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    hash: jest.fn()
  }
}));

describe("/api/profile/[userId]/password", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when not logged in", async () => {
    getSession.mockResolvedValueOnce({ user: undefined });

    const req = new Request("http://localhost/api/profile/u1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "password123", confirmPassword: "password123" })
    });

    const res = await POST(req, { params: { userId: "u1" } });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
  });

  test("returns 404 when target user not found", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1", isAdmin: false } });
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce(null);

    const req = new Request("http://localhost/api/profile/missing/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "password123", confirmPassword: "password123" })
    });

    const res = await POST(req, { params: { userId: "missing" } });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ message: "User not found" });
  });

  test("returns 401 when non-admin edits someone else", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1", isAdmin: false } });
    prisma.user.findUnique.mockResolvedValueOnce({ id: "u2", username: "other", isAdmin: false });

    const req = new Request("http://localhost/api/profile/u2/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "password123", confirmPassword: "password123" })
    });

    const res = await POST(req, { params: { userId: "u2" } });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
  });

  test("returns 400 on invalid input", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1", isAdmin: false } });
    prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", username: "mikli", isAdmin: false });

    const req = new Request("http://localhost/api/profile/u1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "short", confirmPassword: "short" })
    });

    const res = await POST(req, { params: { userId: "u1" } });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: "Invalid input" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("updates password for self", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1", isAdmin: false } });
    prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", username: "mikli", isAdmin: false });
    bcrypt.hash.mockResolvedValueOnce("hashed");
    prisma.user.update.mockResolvedValueOnce({ id: "u1" });

    const req = new Request("http://localhost/api/profile/u1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "password123", confirmPassword: "password123" })
    });

    const res = await POST(req, { params: { userId: "u1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(bcrypt.hash).toHaveBeenCalledWith("password123", 12);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "hashed" },
      select: { id: true }
    });
  });

  test("admin can update password for other user", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "admin1", isAdmin: true } });
    prisma.user.findUnique.mockResolvedValueOnce({ id: "u2", username: "other", isAdmin: false });
    bcrypt.hash.mockResolvedValueOnce("hashed2");
    prisma.user.update.mockResolvedValueOnce({ id: "u2" });

    const req = new Request("http://localhost/api/profile/u2/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "password123", confirmPassword: "password123" })
    });

    const res = await POST(req, { params: { userId: "u2" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { passwordHash: "hashed2" },
      select: { id: true }
    });
  });

  test("resolves user by username when id lookup misses", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1", isAdmin: true } });
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce({ id: "u77", username: "mikli", isAdmin: false });
    bcrypt.hash.mockResolvedValueOnce("hashed3");
    prisma.user.update.mockResolvedValueOnce({ id: "u77" });

    const req = new Request("http://localhost/api/profile/mikli/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "password123", confirmPassword: "password123" })
    });

    const res = await POST(req, { params: { userId: "mikli" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: "mikli" },
      select: { id: true, username: true, isAdmin: true }
    });
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { username: "mikli" },
      select: { id: true, username: true, isAdmin: true }
    });
  });
});
