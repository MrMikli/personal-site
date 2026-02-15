describe("lib/prisma", () => {
  beforeEach(() => {
    jest.resetModules();
    delete globalThis.prisma;
  });

  test("reuses global prisma if present", async () => {
    globalThis.prisma = { cached: true };

    jest.doMock("@prisma/client", () => ({
      PrismaClient: jest.fn(() => ({ created: true }))
    }));

    const mod = await import("@/lib/prisma");
    expect(mod.prisma).toEqual({ cached: true });
  });

  test("creates PrismaClient when no global exists", async () => {
    const PrismaClient = jest.fn(() => ({ created: true }));
    jest.doMock("@prisma/client", () => ({ PrismaClient }));

    const mod = await import("@/lib/prisma");
    expect(mod.prisma).toEqual({ created: true });
    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });
});
