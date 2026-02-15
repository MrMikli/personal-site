import { getIronSession } from "iron-session";

jest.mock("iron-session", () => ({
  getIronSession: jest.fn()
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => ({}))
}));

describe("lib/session", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns {user: undefined} when iron-session throws", async () => {
    getIronSession.mockRejectedValueOnce(new Error("boom"));

    const { getSession } = await import("@/lib/session");
    const session = await getSession();

    expect(session).toEqual({ user: undefined });
  });

  test("masks admin when viewAsNonAdmin is enabled", async () => {
    const session = {
      user: { id: "u1", username: "a", isAdmin: true },
      viewAsNonAdmin: true
    };
    getIronSession.mockResolvedValueOnce(session);

    const { getSession } = await import("@/lib/session");
    const res = await getSession();

    expect(res.user.isAdminActual).toBe(true);
    expect(res.user.isAdminMasked).toBe(true);
    expect(res.user.isAdmin).toBe(false);
  });
});
