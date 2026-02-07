"use client";
import { useEffect, useState } from "react";

export default function GauntletManagerClient() {
  const [gauntlets, setGauntlets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [heats, setHeats] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [gName, setGName] = useState("");

  const [hName, setHName] = useState("");
  const [hOrder, setHOrder] = useState(1);
  const [hStartsAt, setHStartsAt] = useState("");
  const [hEndsAt, setHEndsAt] = useState("");
  const [hDefaultCount, setHDefaultCount] = useState(1);

  async function loadGauntlets() {
    setError("");
    const res = await fetch("/api/admin/gauntlets");
    const json = await res.json();
    if (!res.ok) {
      setError(json?.message || "Failed to load gauntlets");
      return;
    }
    setGauntlets(json.gauntlets || []);
  }

  async function loadHeats(id) {
    if (!id) return;
    setError("");
    const res = await fetch(`/api/admin/gauntlets/${id}/heats`);
    const json = await res.json();
    if (!res.ok) {
      setError(json?.message || "Failed to load heats");
      return;
    }
    setHeats(json.heats || []);
  }

  async function loadPlatforms() {
    setError("");
    const res = await fetch("/api/admin/platforms?hasGames=true");
    const json = await res.json();
    if (!res.ok) {
      setError(json?.message || "Failed to load platforms");
      return;
    }
    setPlatforms(json.platforms || []);
  }

  useEffect(() => {
    loadGauntlets();
    loadPlatforms();
  }, []);

  useEffect(() => {
    if (selectedId) loadHeats(selectedId);
  }, [selectedId]);

  async function createGauntlet() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/gauntlets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: gName.trim() })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to create gauntlet");
      setGName("");
      await loadGauntlets();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function createHeat() {
    if (!selectedId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/gauntlets/${selectedId}/heats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: hName.trim() || null,
          order: Number(hOrder) || 1,
          startsAt: hStartsAt || null,
          endsAt: hEndsAt || null,
          defaultGameCounter: Number(hDefaultCount) || 1,
          platformIds: selectedPlatformIds
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to create heat");
      setHName("");
      setHOrder(1);
      setHStartsAt("");
      setHEndsAt("");
      setHDefaultCount(1);
      setSelectedPlatformIds([]);
      await loadHeats(selectedId);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteHeat(id) {
    if (!selectedId || !id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/gauntlets/${selectedId}/heats/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to delete heat");
      await loadHeats(selectedId);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div style={{ color: "crimson" }}>{error}</div>}

      <section>
        <h2>Create Gauntlet</h2>
        <div style={{ display: "grid", gap: 8, maxWidth: 600 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Name</span>
            <input value={gName} onChange={(e) => setGName(e.target.value)} />
          </label>
          <button onClick={createGauntlet} disabled={loading || !gName.trim()}>
            Create Gauntlet
          </button>
        </div>
      </section>

      <section>
        <h2>Manage Heats</h2>
        <label style={{ display: "grid", gap: 4, maxWidth: 400 }}>
          <span>Select Gauntlet</span>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">-- Choose --</option>
            {gauntlets.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        {selectedId && (
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <h3>Existing Heats</h3>
              {heats.length === 0 ? (
                <p>No heats yet.</p>
              ) : (
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Order</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Name</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Start Date</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>End Date</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Default Count</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Platforms</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heats.map((h) => (
                      <tr key={h.id}>
                        <td style={{ padding: 8 }}>{h.order}</td>
                        <td style={{ padding: 8 }}>{h.name || ""}</td>
                        <td style={{ padding: 8 }}>{h.startsAt ? new Date(h.startsAt).toLocaleDateString() : ""}</td>
                        <td style={{ padding: 8 }}>{h.endsAt ? new Date(h.endsAt).toLocaleDateString() : ""}</td>
                        <td style={{ padding: 8 }}>{h.defaultGameCounter}</td>
                        <td style={{ padding: 8 }}>{(h.platforms || []).map((p) => p.name).join(", ")}</td>
                        <td style={{ padding: 8 }}>
                          <button onClick={() => deleteHeat(h.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <h3>Add Heat</h3>
              <div style={{ display: "grid", gap: 8, maxWidth: 600 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Name (optional)</span>
                  <input value={hName} onChange={(e) => setHName(e.target.value)} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Order</span>
                  <input type="number" value={hOrder} onChange={(e) => setHOrder(e.target.value)} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Default Game Counter</span>
                  <input type="number" min={1} value={hDefaultCount} onChange={(e) => setHDefaultCount(e.target.value)} />
                </label>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span>Start Date</span>
                    <input type="date" value={hStartsAt} onChange={(e) => setHStartsAt(e.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span>End Date</span>
                    <input type="date" value={hEndsAt} onChange={(e) => setHEndsAt(e.target.value)} />
                  </label>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <span>Platforms</span>
                  <div style={{ display: "grid", gap: 6 }}>
                    {platforms.map((p) => (
                      <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedPlatformIds.includes(p.id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedPlatformIds((prev) => {
                              if (checked) return [...prev, p.id];
                              return prev.filter((id) => id !== p.id);
                            });
                          }}
                        />
                        <span>
                          {p.name}
                          {p.abbreviation ? ` (${p.abbreviation})` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <button onClick={createHeat} disabled={loading || !hStartsAt || !hEndsAt}>
                  Add Heat
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
