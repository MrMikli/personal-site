// Shared helpers for IGDB game queries used by sync routes

// Central definition of which fields we request for games.
// Tag-like fields are expanded to { id, name, slug } so IgdbTag can be filled from the same response.
// release_dates.release_region and release_dates.status stay unexpanded (plain ids): the western-release
// and release-year helpers compare them as numbers.
export const IGDB_GAME_FIELDS = [
  'id',
  'name',
  'slug',
  'url',
  'cover.url',
  'first_release_date',
  'summary',
  'storyline',
  'genres.name',
  'genres.slug',
  'themes.name',
  'themes.slug',
  'keywords.name',
  'keywords.slug',
  'game_modes.name',
  'game_modes.slug',
  'player_perspectives.name',
  'player_perspectives.slug',
  'collections.name',
  'collections.slug',
  'franchises.name',
  'franchises.slug',
  'involved_companies.company.name',
  'involved_companies.company.slug',
  'involved_companies.developer',
  'involved_companies.publisher',
  'involved_companies.porting',
  'involved_companies.supporting',
  'rating',
  'rating_count',
  'aggregated_rating',
  'aggregated_rating_count',
  'total_rating',
  'total_rating_count',
  'release_dates.date',
  'release_dates.human',
  'release_dates.y',
  'release_dates.m',
  'release_dates.platform',
  'release_dates.release_region',
  'release_dates.status',
  'release_dates.date_format',
  'language_supports.language.name',
  'language_supports.language.locale',
  'language_supports.language_support_type',
  // Not mapped to columns; kept in Game.igdbData for later use.
  'alternative_names.name',
  'alternative_names.comment',
  'game_localizations.name',
  'game_localizations.region',
  'age_ratings.organization',
  'age_ratings.rating_category',
  'external_games.uid',
  'external_games.external_game_source'
].join(', ');

// Shared where-clause for which games to include
function yearRangeToUnixSeconds(yearStart, yearEnd) {
  if (yearStart == null || yearEnd == null) return null;
  const ys = Number(yearStart);
  const ye = Number(yearEnd);
  if (!Number.isFinite(ys) || !Number.isFinite(ye)) return null;
  const startYear = Math.floor(ys);
  const endYear = Math.floor(ye);
  if (startYear > endYear) return null;
  const startUnix = Math.floor(Date.UTC(startYear, 0, 1, 0, 0, 0) / 1000);
  // End is exclusive: Jan 1 of the year after endYear.
  const endExclusiveUnix = Math.floor(Date.UTC(endYear + 1, 0, 1, 0, 0, 0) / 1000);
  return { startUnix, endExclusiveUnix };
}

export function buildGameWhere(platformIgdbId, { yearStart, yearEnd } = {}) {
  const range = yearRangeToUnixSeconds(yearStart, yearEnd);

  const platformClause = range
    ? `(release_dates.platform = ${platformIgdbId} & release_dates.date >= ${range.startUnix} & release_dates.date < ${range.endExclusiveUnix})`
    : `(platforms = ${platformIgdbId} | release_dates.platform = ${platformIgdbId})`;

  return `
    ${platformClause}
    & (game_status = null | game_status = 0) 
    & version_parent = null 
    & parent_game = null 
    & ((game_type = null | game_type = 0) | (category = null | category = 0))
    & release_dates.human != "TBD"`;
}

/**
 * Body for fetching specific games by IGDB id (used to backfill games already in the database).
 * No platform or status filter: these games were accepted by an earlier sync.
 */
export function buildGamesByIdQuery(igdbIds) {
  return `fields ${IGDB_GAME_FIELDS};\nwhere id = (${igdbIds.join(',')});\nsort id asc;\nlimit ${igdbIds.length};`;
}

// Full IGDB query body builder for paginated game fetches
export function buildGameQuery({ platformIgdbId, limit, offset = 0, yearStart, yearEnd }) {
  const where = buildGameWhere(platformIgdbId, { yearStart, yearEnd });
  return `fields ${IGDB_GAME_FIELDS};\nwhere ${where};\nsort id asc;\nlimit ${limit};\noffset ${offset};`;
}

// Body for games/count endpoint
export function buildGameCountBody(platformIgdbIdOrOptions) {
  const platformIgdbId =
    typeof platformIgdbIdOrOptions === 'object' && platformIgdbIdOrOptions
      ? platformIgdbIdOrOptions.platformIgdbId
      : platformIgdbIdOrOptions;
  const yearStart =
    typeof platformIgdbIdOrOptions === 'object' && platformIgdbIdOrOptions
      ? platformIgdbIdOrOptions.yearStart
      : undefined;
  const yearEnd =
    typeof platformIgdbIdOrOptions === 'object' && platformIgdbIdOrOptions
      ? platformIgdbIdOrOptions.yearEnd
      : undefined;

  const where = buildGameWhere(platformIgdbId, { yearStart, yearEnd });
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

const WESTERN_REGION_IDS = [1, 2, 3, 8];
// English (US) and English (UK) in IGDB's languages table
const ENGLISH_LANGUAGE_IDS = [7, 8];
// release_date_statuses 35: re-release of an old game on a newer console's store
const DIGITAL_COMPATIBILITY_STATUS = 35;

/**
 * IGDB returns either a bare id or an expanded { id, ... } object depending on the requested fields.
 */
const idOf = (value) => (value != null && typeof value === 'object' ? value.id : value);
const numberOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function uniqueIds(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(idOf).filter((id) => Number.isInteger(id)))];
}

function companyIds(involvedCompanies, roles) {
  if (!Array.isArray(involvedCompanies)) return [];
  return uniqueIds(involvedCompanies.filter((ic) => roles.some((role) => ic?.[role])).map((ic) => ic.company));
}

/**
 * Game columns derived from one IGDB game. Missing keys become empty arrays / nulls.
 */
export function mapIgdbGame(g) {
  const earliest = pickEarliestRelease(g.release_dates);
  const languageIds = uniqueIds((g.language_supports ?? []).map((ls) => ls?.language));

  return {
    name: g.name,
    slug: g.slug ?? null,
    url: g.url ?? null,
    coverUrl: toCoverBigUrl(g.cover),
    releaseDateUnix: earliest?.unix ?? null,
    releaseDateHuman: earliest?.human ?? null,
    hasWesternRelease: hasWesternRelease(g.release_dates),
    genreIds: uniqueIds(g.genres),
    themeIds: uniqueIds(g.themes),
    keywordIds: uniqueIds(g.keywords),
    gameModeIds: uniqueIds(g.game_modes),
    perspectiveIds: uniqueIds(g.player_perspectives),
    collectionIds: uniqueIds(g.collections),
    franchiseIds: uniqueIds(g.franchises),
    developerIds: companyIds(g.involved_companies, ['developer']),
    publisherIds: companyIds(g.involved_companies, ['publisher']),
    porterIds: companyIds(g.involved_companies, ['porting', 'supporting']),
    languageIds,
    hasEnglish: languageIds.some((id) => ENGLISH_LANGUAGE_IDS.includes(id)),
    rating: numberOrNull(g.rating),
    ratingCount: numberOrNull(g.rating_count),
    aggregatedRating: numberOrNull(g.aggregated_rating),
    aggregatedRatingCount: numberOrNull(g.aggregated_rating_count),
    totalRating: numberOrNull(g.total_rating),
    totalRatingCount: numberOrNull(g.total_rating_count),
    igdbData: g
  };
}

function releaseYearOf(rd) {
  if (Number.isInteger(rd?.y)) return rd.y;
  return typeof rd?.date === 'number' ? new Date(rd.date * 1000).getUTCFullYear() : null;
}

/**
 * GamePlatform columns for one IGDB platform id.
 * The year is the platform's original release: digital re-releases are ignored unless they are all there is.
 * A year-range variant (yearStart/yearEnd) takes the earliest release inside its range.
 */
export function mapGamePlatform(g, platformIgdbId, { yearStart, yearEnd } = {}) {
  const pid = Number(platformIgdbId);
  const onPlatform = (Array.isArray(g.release_dates) ? g.release_dates : []).filter(
    (rd) => Number(idOf(rd?.platform)) === pid
  );
  const releaseRegionIds = uniqueIds(onPlatform.map((rd) => rd?.release_region));

  // Prefer original releases; fall back to re-releases when the platform has nothing else.
  const originals = onPlatform.filter((rd) => idOf(rd?.status) !== DIGITAL_COMPATIBILITY_STATUS);
  let candidates = originals.length > 0 ? originals : onPlatform;
  // Narrow to the variant's year range, unless that would leave nothing.
  if (yearStart != null && yearEnd != null) {
    const inRange = candidates.filter((rd) => {
      const year = releaseYearOf(rd);
      return year != null && year >= yearStart && year <= yearEnd;
    });
    if (inRange.length > 0) candidates = inRange;
  }

  const years = candidates.map(releaseYearOf).filter((year) => year != null);
  const dates = candidates.map((rd) => rd?.date).filter((date) => typeof date === 'number');

  return {
    hasWesternRelease: releaseRegionIds.some((id) => WESTERN_REGION_IDS.includes(id)),
    releaseYear: years.length > 0 ? Math.min(...years) : null,
    releaseDateUnix: dates.length > 0 ? Math.min(...dates) : null,
    releaseRegionIds
  };
}

/**
 * IgdbTag rows ({ kind, igdbId, name, slug }) for every named tag on a page of games, deduplicated.
 * Needs the expanded fields from IGDB_GAME_FIELDS; bare ids carry no name and are skipped.
 */
export function collectIgdbTags(games) {
  const tags = new Map();
  // Keyed by kind + id because ids repeat across kinds (34 is a genre and a theme).
  const add = (kind, item, slug = item?.slug) => {
    if (item == null || typeof item !== 'object' || !Number.isInteger(item.id) || !item.name) return;
    tags.set(`${kind}:${item.id}`, { kind, igdbId: item.id, name: item.name, slug: slug ?? null });
  };

  for (const g of games) {
    for (const item of g.genres ?? []) add('GENRE', item);
    for (const item of g.themes ?? []) add('THEME', item);
    for (const item of g.keywords ?? []) add('KEYWORD', item);
    for (const item of g.game_modes ?? []) add('GAME_MODE', item);
    for (const item of g.player_perspectives ?? []) add('PERSPECTIVE', item);
    for (const item of g.collections ?? []) add('COLLECTION', item);
    for (const item of g.franchises ?? []) add('FRANCHISE', item);
    for (const ic of g.involved_companies ?? []) add('COMPANY', ic?.company);
    for (const ls of g.language_supports ?? []) add('LANGUAGE', ls?.language, ls?.language?.locale);
  }
  return [...tags.values()];
}

// popularity_primitives types sourced from IGDB itself, so they cover retro games.
const POPULARITY_COLUMNS = { 1: 'popVisits', 2: 'popWantToPlay', 3: 'popPlaying', 4: 'popPlayed' };

/**
 * Multiquery body: one block per popularity type, because 500 games x 4 types would exceed the 500 row limit.
 */
export function buildPopularityMultiquery(igdbIds) {
  const ids = igdbIds.join(',');
  return Object.keys(POPULARITY_COLUMNS)
    .map(
      (type) =>
        `query popularity_primitives "type${type}" { fields game_id,popularity_type,value; where game_id = (${ids}) & popularity_type = ${type}; limit 500; };`
    )
    .join('\n');
}

/**
 * Multiquery response -> Map(igdbId -> { popVisits, popWantToPlay, popPlaying, popPlayed }).
 */
export function mapPopularity(multiqueryResult) {
  const byGame = new Map();
  for (const block of Array.isArray(multiqueryResult) ? multiqueryResult : []) {
    for (const row of Array.isArray(block?.result) ? block.result : []) {
      const column = POPULARITY_COLUMNS[row?.popularity_type];
      if (!column || row.game_id == null) continue;
      if (!byGame.has(row.game_id)) byGame.set(row.game_id, {});
      byGame.get(row.game_id)[column] = numberOrNull(row.value);
    }
  }
  return byGame;
}
