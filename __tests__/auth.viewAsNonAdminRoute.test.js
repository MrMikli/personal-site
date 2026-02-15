import { POST } from "@/app/api/auth/view-as-non-admin/route";
import { getIronSession } from "iron-session";

jest.mock("iron-session", () => ({
  getIronSession: jest.fn()
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => ({}))
}));

jest.mock("@/lib/session", () => ({
  sessionOptions: {}
}));

describe("/api/auth/view-as-non-admin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when not an admin", async () => {
    const session = { user: { isAdmin: false }, save: jest.fn(async () => {}) };
    getIronSession.mockResolvedValueOnce(session);

    const req = new Request("http://localhost/api/auth/view-as-non-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true })
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ message: "Unauthorized" });
    expect(session.save).not.toHaveBeenCalled();
  });

  test("sets flag and saves session", async () => {
    const session = { user: { isAdmin: true }, save: jest.fn(async () => {}) };
    getIronSession.mockResolvedValueOnce(session);

    const req = new Request("http://localhost/api/auth/view-as-non-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ viewAsNonAdmin: true });
    expect(session.viewAsNonAdmin).toBe(true);
    expect(session.save).toHaveBeenCalled();
  });
});
