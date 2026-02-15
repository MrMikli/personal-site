import { POST } from "@/app/api/roll-simulator/roll/route";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    game: { findMany: jest.fn() },
    platform: { findMany: jest.fn() }
  }
}));

describe("/api/roll-simulator/roll", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 400 when no platformIds", async () => {
    const req = new Request("http://localhost/api/roll-simulator/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformIds: [] })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("returns a wheel with chosenIndex", async () => {
    // Make randomness deterministic.
    jest.spyOn(Math, "random").mockReturnValue(0);

    prisma.game.findMany
      // eligibleByPlatform[pid]
      .mockResolvedValueOnce([{ id: "g1" }, { id: "g2" }])
      // platform meta fetch uses prisma.platform.findMany below
      // wheelGames fetch
      .mockResolvedValueOnce([
        { id: "g1", name: "G1", platforms: [] },
        { id: "g2", name: "G2", platforms: [] }
      ]);

    prisma.platform.findMany.mockResolvedValueOnce([
      { id: "p1", name: "P1", abbreviation: "P1" }
    ]);

    const req = new Request("http://localhost/api/roll-simulator/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformIds: ["p1"], onlyWestern: false })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.wheel.games.length).toBeGreaterThan(0);
    expect(json.wheel.chosenIndex).toBe(0);
    expect(json.wheel.slotPlatforms.length).toBe(json.wheel.games.length);

    Math.random.mockRestore();
  });
});
