import { GET, POST } from "@/app/api/admin/gauntlets/route";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn(async () => ({ user: { isAdmin: false } }))
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    gauntlet: {
      findMany: jest.fn(async () => {
        throw new Error("Should not be called when unauthorized");
      }),
      create: jest.fn(async () => {
        throw new Error("Should not be called when unauthorized");
      })
    }
  }
}));

describe("/api/admin/gauntlets authorization", () => {
  test("GET returns 401 for non-admin", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
  });

  test("POST returns 401 for non-admin", async () => {
    const req = new Request("http://localhost/api/admin/gauntlets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" })
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
  });
});
