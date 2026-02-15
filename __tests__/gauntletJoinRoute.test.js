import { POST } from "@/app/api/gauntlet/join/[gauntletId]/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    gauntlet: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    }
  }
}));

describe("/api/gauntlet/join/[gauntletId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when not logged in", async () => {
    getSession.mockResolvedValueOnce(null);

    const res = await POST(null, { params: { gauntletId: "g1" } });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
  });

  test("returns 400 when gauntletId missing", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });

    const res = await POST(null, { params: {} });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: "Missing gauntletId" });
  });

  test("returns 404 when gauntlet not found", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    prisma.gauntlet.findUnique.mockResolvedValueOnce(null);

    const res = await POST(null, { params: { gauntletId: "missing" } });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ message: "Gauntlet not found" });
  });

  test("does not update when already joined", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    prisma.gauntlet.findUnique.mockResolvedValueOnce({ id: "g1" });
    prisma.gauntlet.findFirst.mockResolvedValueOnce({ id: "g1" });

    const res = await POST(null, { params: { gauntletId: "g1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, joined: true });
    expect(prisma.gauntlet.update).not.toHaveBeenCalled();
  });

  test("connects user when not already joined", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    prisma.gauntlet.findUnique.mockResolvedValueOnce({ id: "g1" });
    prisma.gauntlet.findFirst.mockResolvedValueOnce(null);
    prisma.gauntlet.update.mockResolvedValueOnce({ id: "g1" });

    const res = await POST(null, { params: { gauntletId: "g1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, joined: true });

    expect(prisma.gauntlet.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { users: { connect: { id: "u1" } } }
    });
  });
});
