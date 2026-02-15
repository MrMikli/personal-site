import { GET } from "@/app/api/admin/users/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: jest.fn()
    }
  }
}));

describe("/api/admin/users", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 for non-admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: false } });
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
  });

  test("returns users for admin", async () => {
    getSession.mockResolvedValueOnce({ user: { isAdmin: true } });
    prisma.user.findMany.mockResolvedValueOnce([{ id: "u1", username: "a", isAdmin: false }]);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ users: [{ id: "u1", username: "a", isAdmin: false }] });
  });
});
