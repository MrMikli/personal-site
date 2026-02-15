import { POST } from "@/app/api/auth/logout/route";
import { getIronSession } from "iron-session";

jest.mock("iron-session", () => ({
  getIronSession: jest.fn()
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => ({}))
}));

describe("/api/auth/logout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("destroys session and redirects to home", async () => {
    const session = { destroy: jest.fn(async () => {}) };
    getIronSession.mockResolvedValueOnce(session);

    const req = new Request("http://localhost/api/auth/logout", { method: "POST" });
    const res = await POST(req);

    expect(session.destroy).toHaveBeenCalled();
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });
});
