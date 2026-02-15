describe("lib/igdb", () => {
  beforeEach(() => {
    jest.resetModules();
    delete globalThis.igdbTokenCache;
    process.env.IGDB_API_ID = "id";
    process.env.IGDB_API_SECRET = "secret";
  });

  test("getIGDBToken fetches once and caches", async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).includes("oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      throw new Error("Unexpected fetch: " + url);
    });
    global.fetch = fetchMock;

    const { getIGDBToken } = await import("@/lib/igdb");

    await expect(getIGDBToken()).resolves.toBe("tok");
    await expect(getIGDBToken()).resolves.toBe("tok");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("igdbRequest retries once on 401", async () => {
    let igdbCalls = 0;
    const fetchMock = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes("oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("api.igdb.com/v4/games")) {
        igdbCalls += 1;
        if (igdbCalls === 1) {
          return new Response("unauthorized", { status: 401 });
        }
        return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
      }
      throw new Error("Unexpected fetch: " + url);
    });

    global.fetch = fetchMock;

    const { igdbRequest } = await import("@/lib/igdb");
    const json = await igdbRequest("games", "fields id;");

    expect(json).toEqual([{ id: 1 }]);
    // 1 token fetch + 1 igdb call + 1 token refresh + 1 retry
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
