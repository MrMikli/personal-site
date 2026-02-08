export function slugify(value) {
  const str = String(value ?? "").trim().toLowerCase();
  if (!str) return "";

  return str
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// Canonical heat slug: "<gauntletSlug>--<heatSlug>--<order>"
// Uses "--" so we can safely parse boundaries.
export function makeHeatSlug({ gauntletName, heatName, heatOrder }) {
  const g = slugify(gauntletName);
  const h = slugify(heatName || `heat-${heatOrder}`);
  const order = Number(heatOrder) || 0;
  return `${g}--${h}--${order}`;
}

export function parseHeatSlug(slug) {
  if (typeof slug !== "string") return null;
  const parts = slug.split("--");
  if (parts.length < 3) return null;
  const orderRaw = parts[parts.length - 1];
  const heatSlug = parts[parts.length - 2] || "";
  const gauntletSlug = parts.slice(0, -2).join("--") || "";
  const order = Number(orderRaw);
  if (!Number.isFinite(order) || order <= 0) return null;
  if (!gauntletSlug) return null;
  return { gauntletSlug, heatSlug, order };
}
