"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString();
}

function getGameYear(game) {
  if (!game) return null;
  if (game.releaseDateUnix != null) {
    const unix = Number(game.releaseDateUnix);
    if (Number.isFinite(unix) && unix > 0) {
      return new Date(unix * 1000).getUTCFullYear();
    }
  }
  if (typeof game.releaseDateHuman === "string") {
    const match = game.releaseDateHuman.match(/(\d{4})/);
    if (match) return match[1];
  }
  return null;
}

const STATUS_OPTIONS = [
  { value: "UNBEATEN", label: "Unbeaten" },
  { value: "BEATEN", label: "Beaten" },
  { value: "GIVEN_UP", label: "Given up" }
];

export default function GauntletClient({ current, upcoming, previous }) {
  const [selectedSection, setSelectedSection] = useState(
    current.length ? "current" : upcoming.length ? "upcoming" : previous.length ? "previous" : "current"
  );

  const listForSection = useMemo(() => {
    if (selectedSection === "current") return current;
    if (selectedSection === "upcoming") return upcoming;
    if (selectedSection === "previous") return previous;
    return [];
  }, [selectedSection, current, upcoming, previous]);

  const [selectedGauntletId, setSelectedGauntletId] = useState(() => {
    if (current[0]) return current[0].id;
    if (upcoming[0]) return upcoming[0].id;
    if (previous[0]) return previous[0].id;
    return "";
  });

  const selectedGauntlet = useMemo(
    () => listForSection.find((g) => g.id === selectedGauntletId) || listForSection[0] || null,
    [listForSection, selectedGauntletId]
  );

  function switchSection(section) {
    setSelectedSection(section);
    const list = section === "current" ? current : section === "upcoming" ? upcoming : previous;
    if (list && list.length) {
      setSelectedGauntletId(list[0].id);
    } else {
      setSelectedGauntletId("");
    }
  }

  const [statusByHeatId, setStatusByHeatId] = useState({});

  async function handleStatusChange(heatId, nextStatus) {
    setStatusByHeatId((prev) => ({ ...prev, [heatId]: nextStatus }));
    try {
      const res = await fetch(`/api/gauntlet/heats/${heatId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) {
        // revert on error
        setStatusByHeatId((prev) => {
          const clone = { ...prev };
          delete clone[heatId];
          return clone;
        });
      }
    } catch (_e) {
      setStatusByHeatId((prev) => {
        const clone = { ...prev };
        delete clone[heatId];
        return clone;
      });
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => switchSection("current")}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid",
            borderColor: selectedSection === "current" ? "#1976d2" : "#ccc",
            background: selectedSection === "current" ? "#1976d2" : "#f5f5f5",
            color: selectedSection === "current" ? "white" : "#333",
            cursor: "pointer"
          }}
        >
          Current
        </button>
        <button
          type="button"
          onClick={() => switchSection("upcoming")}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid",
            borderColor: selectedSection === "upcoming" ? "#1976d2" : "#ccc",
            background: selectedSection === "upcoming" ? "#1976d2" : "#f5f5f5",
            color: selectedSection === "upcoming" ? "white" : "#333",
            cursor: "pointer"
          }}
        >
          Upcoming
        </button>
        <button
          type="button"
          onClick={() => switchSection("previous")}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid",
            borderColor: selectedSection === "previous" ? "#1976d2" : "#ccc",
            background: selectedSection === "previous" ? "#1976d2" : "#f5f5f5",
            color: selectedSection === "previous" ? "white" : "#333",
            cursor: "pointer"
          }}
        >
          Previous
        </button>
      </div>

      {!current.length && selectedSection === "current" && (
        <p style={{ margin: 0 }}>No current gauntlet is running right now.</p>
      )}

      {listForSection.length === 0 && selectedSection !== "current" && (
        <p style={{ margin: 0 }}>No gauntlets in this section yet.</p>
      )}

      {listForSection.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {listForSection.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGauntletId(g.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: selectedGauntlet && selectedGauntlet.id === g.id ? "#1976d2" : "#ccc",
                  background: selectedGauntlet && selectedGauntlet.id === g.id ? "#1976d2" : "#fff",
                  color: selectedGauntlet && selectedGauntlet.id === g.id ? "white" : "#333",
                  cursor: "pointer"
                }}
              >
                {g.name}
              </button>
            ))}
          </div>

          {selectedGauntlet && (
            <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12 }}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>{selectedGauntlet.name}</h3>
              {selectedGauntlet.heats.length === 0 ? (
                <p style={{ margin: 0 }}>No heats configured for this gauntlet yet.</p>
              ) : (
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Name</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Start</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>End</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Platforms</th>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Your game</th>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Status</th>
                          <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                        {selectedGauntlet.heats.map((h) => {
                          const user = h.user || {};
                          const game = user.selectedGame || null;
                          const year = game ? getGameYear(game) : null;
                          const currentStatus = statusByHeatId[h.id] || user.status || "UNBEATEN";
                          const hasPool = !!(user.hasRolls || game);
                          const buttonLabel = hasPool ? "View roll pool" : "Go to game selection";

                          return (
                            <tr key={h.id}>
                              <td style={{ padding: 6 }}>{h.name || `Heat ${h.order}`}</td>
                              <td style={{ padding: 6 }}>{formatDate(h.startsAt)}</td>
                              <td style={{ padding: 6 }}>{formatDate(h.endsAt)}</td>
                              <td style={{ padding: 6 }}>
                                {(h.platforms || []).map((p) => p.name).join(", ")}
                              </td>
                              <td style={{ padding: 6 }}>
                                {game ? (
                                  <span>
                                    {game.name}
                                    {year ? ` (${year})` : ""}
                                  </span>
                                ) : (
                                  <span style={{ color: "#777", fontStyle: "italic" }}>
                                    Not chosen yet
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: 6 }}>
                                <select
                                  value={currentStatus}
                                  onChange={(e) => handleStatusChange(h.id, e.target.value)}
                                  style={{ fontSize: 13 }}
                                >
                                  {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: 6 }}>
                                <Link href={`/gauntlet/heat/${h.id}`}>
                                  <button type="button" style={{ padding: "4px 8px", fontSize: 13 }}>
                                    {buttonLabel}
                                  </button>
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
