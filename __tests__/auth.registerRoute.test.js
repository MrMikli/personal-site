import { POST } from "@/app/api/auth/register/route";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getIronSession } from "iron-session";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn()
    }
  }
}));

jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    hash: jest.fn()
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

describe("/api/auth/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 400 on invalid input", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ab" })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: "Invalid input" });
  });

  test("returns 400 when username is taken", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: "u1" });

    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "mikli",
        password: "password123",
        confirmPassword: "password123"
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: "Username already taken" });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("creates user and saves session on success", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    bcrypt.hash.mockResolvedValueOnce("hashed");
    prisma.user.create.mockResolvedValueOnce({ id: "u1", username: "mikli", isAdmin: false });

    const session = { save: jest.fn(async () => {}), user: null };
    getIronSession.mockResolvedValueOnce(session);

    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "mikli",
        password: "password123",
        confirmPassword: "password123"
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(prisma.user.create).toHaveBeenCalled();
    expect(session.user).toEqual({ id: "u1", username: "mikli", isAdmin: false });
    expect(session.save).toHaveBeenCalled();
  });
});
