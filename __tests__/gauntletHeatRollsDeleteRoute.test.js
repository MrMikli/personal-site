import { DELETE } from "@/app/api/gauntlet/heats/[heatId]/rolls/[rollId]/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

jest.mock("@/lib/session", () => ({
  getSession: jest.fn()
}));

jest.mock("@/lib/heatGuards", () => ({
  ensureHeatIsMutable: jest.fn()
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    heatRoll: { findUnique: jest.fn(), delete: jest.fn() }
  }
}));

describe("/api/gauntlet/heats/[heatId]/rolls/[rollId] DELETE", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when not logged in", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await DELETE(null, { params: { heatId: "h1", rollId: "r1" } });
    expect(res.status).toBe(401);
  });

  test("deletes roll when owned by user", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "u1" } });
    ensureHeatIsMutable.mockResolvedValueOnce({ ok: true });
    prisma.heatRoll.findUnique.mockResolvedValueOnce({
      id: "r1",
      heatSignup: { heatId: "h1", userId: "u1" }
    });

    const res = await DELETE(null, { params: { heatId: "h1", rollId: "r1" } });
    expect(res.status).toBe(200);
    expect(prisma.heatRoll.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
});
