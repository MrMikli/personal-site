// Shared helpers for IGDB game queries used by sync routes

// Central definition of which fields we request for games
export const IGDB_GAME_FIELDS = [
  'id',
  'name',
  'slug',
  'release_dates.date',
  'release_dates.human',
  'cover.url',
  'platforms.id',
].join(', ');

// Shared where-clause for which games to include
export function buildGameWhere(platformIgdbId) {
  return `platforms = ${platformIgdbId} & (game_status = null | game_status = 0) & version_parent = null & parent_game = null & ((game_type = null | game_type = 0) | (category = null | category = 0))`;
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
