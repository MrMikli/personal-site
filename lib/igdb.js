const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_API_URL = "https://api.igdb.com/v4";

const globalForIGDB = globalThis;

// Simple in-memory token cache (shared across dev hot-reloads)
const tokenCache = globalForIGDB.igdbTokenCache || { accessToken: null, expiresAt: 0 };
if (process.env.NODE_ENV !== "production") globalForIGDB.igdbTokenCache = tokenCache;

function getClientId() {
  const v = process.env.IGDB_API_ID;
  if (!v) throw new Error("Missing IGDB_API_ID in environment");
  return v;
}

function getClientSecret() {
  const v = process.env.IGDB_API_SECRET;
  if (!v) throw new Error("Missing IGDB_API_SECRET in environment");
  return v;
}

function isExpired() {
  return !tokenCache.accessToken || Date.now() >= tokenCache.expiresAt;
}

async function fetchAppAccessToken() {
  const params = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "client_credentials"
  });

  const res = await fetch(`${TWITCH_TOKEN_URL}?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch Twitch app token: ${res.status} ${text}`);
  }

  const json = await res.json();
  const { access_token, expires_in } = json;
  // Refresh a bit early (2 minutes) to avoid edge expiry during requests
  const expiresAt = Date.now() + Math.max(0, (expires_in - 120)) * 1000;
  tokenCache.accessToken = access_token;
  tokenCache.expiresAt = expiresAt;
  return access_token;
}

export async function getIGDBToken() {
  if (isExpired()) {
    await fetchAppAccessToken();
  }
  return tokenCache.accessToken;
}

export async function igdbRequest(endpoint, body) {
  const token = await getIGDBToken();
  const res = await fetch(`${IGDB_API_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": getClientId(),
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain"
    },
    body
  });

  // If unauthorized, refresh token once and retry
  if (res.status === 401) {
    await fetchAppAccessToken();
    const retry = await fetch(`${IGDB_API_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": getClientId(),
        Authorization: `Bearer ${tokenCache.accessToken}`,
        "Content-Type": "text/plain"
      },
      body
    });
    if (!retry.ok) {
      const text = await retry.text().catch(() => "");
      throw new Error(`IGDB request failed after retry: ${retry.status} ${text}`);
    }
    return retry.json();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`IGDB request failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function fetchAllPlatforms() {
  const fields = "fields id,name,abbreviation,generation;";
  const pageSize = 500;
  let offset = 0;
  const all = [];
  while (true) {
    const query = `${fields} limit ${pageSize}; offset ${offset};`;
    const batch = await igdbRequest("platforms", query);
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    // Safety guard: don't loop forever
    if (offset > 5000) break;
  }
  return all;
}
