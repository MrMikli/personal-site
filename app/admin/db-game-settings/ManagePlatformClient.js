"use client";
import { useMemo, useState } from "react";

function formatName(p) {
  return p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name;
}

export default function ManagePlatformClient({ platforms }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return platforms;
    return platforms.filter(p => {
      const name = (p.name || "").toLowerCase();
      const abbr = (p.abbreviation || "").toLowerCase();
      return name.includes(q) || abbr.includes(q);
    });
  }, [platforms, query]);

  const selected = useMemo(() => filtered.find(p => p.id === selectedId), [filtered, selectedId]);

  async function handleSync() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/igdb/sync-games/${selected.igdbId}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || 'Failed to sync games');
      }
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span>Search platform</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or abbreviation"
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span>Select platform</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">-- Choose a platform --</option>
          {filtered.map((p) => (
            <option key={p.id} value={p.id}>
              {formatName(p)}
            </option>
          ))}
        </select>
      </label>

      {selectedId && (
        <div style={{ marginTop: 8 }}>
          <button onClick={handleSync} disabled={loading}>
            {loading ? 'Syncing…' : `Sync games for ${formatName(filtered.find(p => p.id === selectedId) || { name: 'selected platform' })}`}
          </button>
          {result && (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              Synced: processed={result.processed}, inserted={result.inserted}, updated={result.updated}
            </div>
          )}
          {error && (
            <div style={{ color: 'red', fontSize: 13, marginTop: 8 }}>
              Error: {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
