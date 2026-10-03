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

  test("igdbRequest waits and retries once on 429", async () => {
    const statuses = [429, 200];
    global.fetch = jest.fn(async (url, init) => {
      if (String(url).includes("oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const status = statuses.shift();
      return new Response(status === 200 ? JSON.stringify([{ id: 1 }]) : "Too Many Requests", { status });
    });

    const { igdbRequest } = await import("@/lib/igdb");

    await expect(igdbRequest("games", "fields id;")).resolves.toEqual([{ id: 1 }]);
    // 1 token fetch + 2 igdb calls
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test("igdbRequest throws when the retry also fails", async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes("oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      return new Response("down", { status: 503 });
    });

    const { igdbRequest } = await import("@/lib/igdb");

    await expect(igdbRequest("games", "fields id;")).rejects.toThrow("IGDB request failed: 503 down");
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
