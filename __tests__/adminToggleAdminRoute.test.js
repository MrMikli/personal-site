import { POST } from "@/app/api/admin/toggle-admin/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: jest.fn()
    }
  }
}));

describe("/api/admin/toggle-admin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });

    const req = new Request("http://localhost/api/admin/toggle-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "mikli", isAdmin: true })
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
  });

  test("returns 400 for invalid payload", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });

    const req = new Request("http://localhost/api/admin/toggle-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "" })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: "Invalid payload" });
  });

  test("returns 404 when user not found", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.user.update.mockResolvedValueOnce(null);

    const req = new Request("http://localhost/api/admin/toggle-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "missing", isAdmin: true })
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ message: "User not found" });
  });

  test("returns updated user", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.user.update.mockResolvedValueOnce({ id: "u1", username: "mikli", isAdmin: true });

    const req = new Request("http://localhost/api/admin/toggle-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "mikli", isAdmin: true })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      user: { id: "u1", username: "mikli", isAdmin: true }
    });
  });
});
