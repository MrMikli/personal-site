"use client";
import { useEffect, useState } from "react";
import styles from "./GauntletManagerClient.module.css";

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
  const [hStartsAt, setHStartsAt] = useState("");
  const [hEndsAt, setHEndsAt] = useState("");
  const [hDefaultCount, setHDefaultCount] = useState(1);

  const nextOrder = heats.length
    ? Math.max(...heats.map((h) => Number(h.order) || 0)) + 1
    : 1;

  function toDateInputValue(value) {
    if (!value) return "";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toISOString().slice(0, 10);
  }

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
    setHeats(
      (json.heats || []).map((h) => ({
        ...h,
        startsAt: toDateInputValue(h.startsAt),
        endsAt: toDateInputValue(h.endsAt)
      }))
    );
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
          order: nextOrder,
          startsAt: hStartsAt || null,
          endsAt: hEndsAt || null,
          defaultGameCounter: Number(hDefaultCount) || 1,
          platformIds: selectedPlatformIds
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to create heat");
      setHName("");
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

  async function updateHeat(updatedHeat) {
    if (!selectedId || !updatedHeat?.id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/gauntlets/${selectedId}/heats/${updatedHeat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: updatedHeat.name || null,
          order: Number(updatedHeat.order) || 1,
          startsAt: updatedHeat.startsAt || null,
          endsAt: updatedHeat.endsAt || null,
          defaultGameCounter: Number(updatedHeat.defaultGameCounter) || 1,
          platformIds: (updatedHeat.platforms || []).map((p) => p.id)
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to update heat");
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
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}

      <section>
        <h2>Create Gauntlet</h2>
        <div className={styles.sectionGrid}>
          <label className={styles.field}>
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
        <label className={styles.gauntletSelect}>
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
          <div className={styles.manageGrid}>
            <div>
              <h3>Existing Heats</h3>
              {heats.length === 0 ? (
                <p>No heats yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table-compact">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Name</th>
                        <th>Start Date</th>
                        <th>End Date</th>
                        <th>Default Count</th>
                        <th>Platforms</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heats.map((h) => (
                        <tr key={h.id}>
                          <td>
                          <input
                            type="number"
                            className={styles.orderInput}
                            value={h.order ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setHeats((prev) =>
                                prev.map((row) =>
                                  row.id === h.id ? { ...row, order: value === "" ? "" : Number(value) } : row
                                )
                              );
                            }}
                          />
                          </td>
                          <td>
                          <input
                            value={h.name || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setHeats((prev) =>
                                prev.map((row) => (row.id === h.id ? { ...row, name: value } : row))
                              );
                            }}
                          />
                          </td>
                          <td>
                          <input
                            type="date"
                            value={h.startsAt || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setHeats((prev) =>
                                prev.map((row) => (row.id === h.id ? { ...row, startsAt: value } : row))
                              );
                            }}
                          />
                          </td>
                          <td>
                          <input
                            type="date"
                            value={h.endsAt || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setHeats((prev) =>
                                prev.map((row) => (row.id === h.id ? { ...row, endsAt: value } : row))
                              );
                            }}
                          />
                          </td>
                          <td>
                          <input
                            type="number"
                            min={1}
                            className={styles.countInput}
                            value={h.defaultGameCounter ?? 1}
                            onChange={(e) => {
                              const value = e.target.value;
                              setHeats((prev) =>
                                prev.map((row) =>
                                  row.id === h.id
                                    ? { ...row, defaultGameCounter: value === "" ? "" : Number(value) }
                                    : row
                                )
                              );
                            }}
                          />
                          </td>
                        <td>
                          <div className={styles.platformsGridSmall}>
                            {platforms.map((p) => {
                              const checked = (h.platforms || []).some((hp) => hp.id === p.id);
                              return (
                                <label
                                  key={p.id}
                                  className={styles.platformRowSmall}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const isChecked = e.target.checked;
                                      setHeats((prev) =>
                                        prev.map((row) => {
                                          if (row.id !== h.id) return row;
                                          const current = row.platforms || [];
                                          if (isChecked) {
                                            if (current.some((hp) => hp.id === p.id)) return row;
                                            return {
                                              ...row,
                                              platforms: [...current, p]
                                            };
                                          }
                                          return {
                                            ...row,
                                            platforms: current.filter((hp) => hp.id !== p.id)
                                          };
                                        })
                                      );
                                    }}
                                  />
                                  <span>
                                    {p.name}
                                    {p.abbreviation ? ` (${p.abbreviation})` : ""}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          <button
                            onClick={() => updateHeat(h)}
                            disabled={loading}
                            className={styles.saveButton}
                          >
                            Save
                          </button>
                          <button onClick={() => deleteHeat(h.id)} disabled={loading}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            <div>
              <h3>Add Heat</h3>
              <div className={styles.sectionGrid}>
                <label className={styles.field}>
                  <span>Name (optional)</span>
                  <input value={hName} onChange={(e) => setHName(e.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>Order (auto)</span>
                  <input type="number" value={nextOrder} readOnly />
                </label>
                <label className={styles.field}>
                  <span>Default Game Counter</span>
                  <input type="number" min={1} value={hDefaultCount} onChange={(e) => setHDefaultCount(e.target.value)} />
                </label>
                <div className={styles.dateGrid}>
                  <label className={styles.field}>
                    <span>Start Date</span>
                    <input type="date" value={hStartsAt} onChange={(e) => setHStartsAt(e.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>End Date</span>
                    <input type="date" value={hEndsAt} onChange={(e) => setHEndsAt(e.target.value)} />
                  </label>
                </div>
                <div className={styles.platformsSection}>
                  <span>Platforms</span>
                  <div className={styles.platformsList}>
                    {platforms.map((p) => (
                      <label key={p.id} className={styles.platformRow}>
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
