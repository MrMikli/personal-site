// Shared helpers for IGDB game queries used by sync routes

// Central definition of which fields we request for games
export const IGDB_GAME_FIELDS = [
  'id',
  'name',
  'slug',
  'release_dates.date',
  'release_dates.human',
  'release_dates.platform',
  'cover.url',
  'platforms.id',
  'release_dates.region',
  'release_dates.release_region'
].join(', ');

// Shared where-clause for which games to include
export function buildGameWhere(platformIgdbId) {
  return `
    platforms = ${platformIgdbId} 
    & (game_status = null | game_status = 0) 
    & version_parent = null 
    & parent_game = null 
    & ((game_type = null | game_type = 0) | (category = null | category = 0))
    & release_dates.human != "TBD"`;
}

// Full IGDB query body builder for paginated game fetches
export function buildGameQuery({ platformIgdbId, limit, offset = 0 }) {
  const where = buildGameWhere(platformIgdbId);
  return `fields ${IGDB_GAME_FIELDS};\nwhere ${where};\nsort id asc;\nlimit ${limit};\noffset ${offset};`;
}

// Body for games/count endpoint
export function buildGameCountBody(platformIgdbId) {
  const where = buildGameWhere(platformIgdbId);
  return `where ${where};`;
}

// Utility to pick earliest release date from IGDB release_dates array
export function pickEarliestRelease(release_dates) {
  if (!Array.isArray(release_dates) || release_dates.length === 0) return null;
  // IGDB date is Unix seconds
  const sorted = [...release_dates].sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
  const first = sorted[0];
  return { unix: first?.date ?? null, human: first?.human ?? null };
}

// Normalize IGDB cover URL to t_cover_big variant
export function toCoverBigUrl(cover) {
  const raw = cover?.url;
  if (!raw) return null;
  const withScheme = raw.startsWith('//') ? `https:${raw}` : raw;
  return withScheme.replace(/\/t_[^/]+\//, '/t_cover_big/');
}

export function hasWesternRelease(release_dates) {
  if (!Array.isArray(release_dates) || release_dates.length === 0) return false;

  // Check if release_dates includes any Western regions.
  // IGDB uses region enum (1 = Europe, 2 = North America, 3 = Australia, 8 = Worldwide).
  return release_dates.some((rd) => {
    const region = rd?.region ?? rd?.release_region;
    return [1, 2, 3, 8].includes(region);
  });
}

export function hasWesternReleaseForPlatform(release_dates, platformIgdbId) {
  if (!Array.isArray(release_dates) || release_dates.length === 0) return false;
  if (!platformIgdbId || Number.isNaN(Number(platformIgdbId))) return false;
  const pid = Number(platformIgdbId);

  return release_dates.some((rd) => {
    const region = rd?.region ?? rd?.release_region;
    const releasePlatform = rd?.platform?.id ?? rd?.platform;
    if (Number(releasePlatform) !== pid) return false;
    return [1, 2, 3, 8].includes(region);
  });
}
