import { POST } from "@/app/api/auth/login/route";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getIronSession } from "iron-session";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn()
    }
  }
}));

jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    compare: jest.fn()
  }
}));

jest.mock("iron-session", () => ({
  getIronSession: jest.fn()
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => ({}))
}));

jest.mock("@/lib/session", () => ({
  sessionOptions: {}
}));

describe("/api/auth/login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 400 on invalid input", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "" })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: "Invalid credentials" });
  });

  test("returns 401 when user not found", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "mikli", password: "password123" })
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Invalid username or password" });
  });

  test("returns 401 when password mismatch", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      username: "mikli",
      isAdmin: false,
      passwordHash: "hashed"
    });
    bcrypt.compare.mockResolvedValueOnce(false);

    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "mikli", password: "wrong" })
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Invalid username or password" });
  });

  test("saves session on success", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      username: "mikli",
      isAdmin: true,
      passwordHash: "hashed"
    });
    bcrypt.compare.mockResolvedValueOnce(true);

    const session = { save: jest.fn(async () => {}), user: null };
    getIronSession.mockResolvedValueOnce(session);

    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "mikli", password: "password123" })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(session.user).toEqual({ id: "u1", username: "mikli", isAdmin: true });
    expect(session.save).toHaveBeenCalled();
  });
});
