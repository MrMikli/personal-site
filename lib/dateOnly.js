export function getUtcDateOnlyParts(value) {
  if (!value) return null;

  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;

  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth(),
    day: dt.getUTCDate()
  };
}

export function getUtcDayBoundsMs(value) {
  const parts = getUtcDateOnlyParts(value);
  if (!parts) return null;

  const start = Date.UTC(parts.year, parts.month, parts.day, 0, 0, 0, 0);
  const end = Date.UTC(parts.year, parts.month, parts.day, 23, 59, 59, 999);
  return { start, end };
}

export function formatDateOnlyUTC(value) {
  const parts = getUtcDateOnlyParts(value);
  if (!parts) return "";

  const dt = new Date(Date.UTC(parts.year, parts.month, parts.day, 0, 0, 0, 0));
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(dt);
}

export function addUtcDaysMs(utcMs, days) {
  return utcMs + days * 24 * 60 * 60 * 1000;
}
