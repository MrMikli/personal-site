import { GET } from "@/app/api/health/route";

describe("/api/health", () => {
  test("returns ok: true", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
