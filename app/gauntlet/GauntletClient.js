"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./GauntletClient.module.css";
import { makeHeatSlug } from "@/lib/slug";
import next from "next";

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

function isTerminalStatus(status) {
  return status === "BEATEN" || status === "GIVEN_UP";
}

export default function GauntletClient({ current, upcoming, previous }) {
  const router = useRouter();

  // When navigating back/forward, Next can reuse prefetched/cached RSC payloads.
  // Refresh on mount to ensure the table reflects the current DB state.
  useEffect(() => {
    router.refresh();
  }, [router]);

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

  const [joinedByGauntletId, setJoinedByGauntletId] = useState(() => {
    const pairs = [];
    for (const g of [...(current || []), ...(upcoming || []), ...(previous || [])]) {
      if (g && g.id) pairs.push([g.id, !!g.joined]);
    }
    return Object.fromEntries(pairs);
  });

  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const selectedGauntlet = useMemo(
    () => listForSection.find((g) => g.id === selectedGauntletId) || listForSection[0] || null,
    [listForSection, selectedGauntletId]
  );

  const isPreviousSection = selectedSection === "previous";
  const selectedIsJoined = selectedGauntlet
    ? (joinedByGauntletId[selectedGauntlet.id] ?? !!selectedGauntlet.joined)
    : false;
  const canViewDetails = isPreviousSection || selectedIsJoined;

  async function handleJoinSelectedGauntlet() {
    if (!selectedGauntlet?.id) return;
    setJoinError("");
    setIsJoining(true);
    try {
      const res = await fetch(`/api/gauntlet/join/${selectedGauntlet.id}`, {
        method: "POST"
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || `Failed to join (HTTP ${res.status})`);
      }
      setJoinedByGauntletId((prev) => ({ ...prev, [selectedGauntlet.id]: true }));
      router.refresh();
    } catch (e) {
      setJoinError(String(e?.message || e));
    } finally {
      setIsJoining(false);
    }
  }

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

  async function handleStatusChange({ heatId, nextStatus, prevStatus, heatName, gameName }) {
    if (!heatId) return;
    if (isTerminalStatus(prevStatus)) return;

    if (isTerminalStatus(nextStatus)) {
      const label = nextStatus === "BEATEN" ? "beaten" : "given up on";
      const target = gameName ? `\"${gameName}\"` : "this game";
      const inHeat = heatName ? ` for ${heatName}` : "";
      
      if(nextStatus === "BEATEN") {
        const confirmed = window.confirm(`Are you sure you want to mark ${target} as ${label}${inHeat}? This indicates you've been a God Gamer. You won't be able to change this status later.`);
        if (!confirmed) return;
      }
      if(nextStatus === "GIVEN_UP") {
        const confirmed = window.confirm(`Are you sure you want to mark ${target} as ${label}${inHeat}? This indicates you're a fucking loser. You won't be able to change this status later.`);
      }
    }

    setStatusByHeatId((prev) => ({ ...prev, [heatId]: nextStatus }));
    try {
      const res = await fetch(`/api/gauntlet/heats/${heatId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Failed to set status");
      if (json?.status && typeof json.status === "string") {
        setStatusByHeatId((prev) => ({ ...prev, [heatId]: json.status }));
      }
    } catch (_e) {
      setStatusByHeatId((prev) => {
        const clone = { ...prev };
        if (typeof prevStatus === "string") {
          clone[heatId] = prevStatus;
        } else {
          delete clone[heatId];
        }
        return clone;
      });
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.sectionButtons}>
        <button
          type="button"
          onClick={() => switchSection("current")}
          className={`${styles.pill} ${selectedSection === "current" ? styles.pillActive : ""}`}
        >
          Current
        </button>
        <button
          type="button"
          onClick={() => switchSection("upcoming")}
          className={`${styles.pill} ${selectedSection === "upcoming" ? styles.pillActive : ""}`}
        >
          Upcoming
        </button>
        <button
          type="button"
          onClick={() => switchSection("previous")}
          className={`${styles.pill} ${selectedSection === "previous" ? styles.pillActive : ""}`}
        >
          Previous
        </button>
      </div>

      {!current.length && selectedSection === "current" && (
        <p className={styles.p0}>No current gauntlet is running right now.</p>
      )}

      {listForSection.length === 0 && selectedSection !== "current" && (
        <p className={styles.p0}>No gauntlets in this section yet.</p>
      )}

      {listForSection.length > 0 && (
        <div className={styles.stack}>
          <div className={styles.gauntletButtons}>
            {listForSection.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGauntletId(g.id)}
                className={`${styles.pill} ${styles.pillOnWhite} ${selectedGauntlet && selectedGauntlet.id === g.id ? styles.pillActive : ""}`}
              >
                {g.name}
              </button>
            ))}
          </div>

          {selectedGauntlet && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>{selectedGauntlet.name}</h3>
              <div className={styles.cardSub}>
                {canViewDetails ? (
                  <Link href={`/gauntlet/scoreboard/${selectedGauntlet.id}`}>
                    View scoreboard →
                  </Link>
                ) : (
                  <span className={styles.mutedItalic}>
                    Join to view heats and scoreboard.
                  </span>
                )}
                {selectedGauntlet.winner && selectedGauntlet.winner.usernames && (
                  <div className={styles.winnerLine}>
                    <strong>
                      {selectedGauntlet.winner.usernames.length === 1 ? "Winner" : "Winners"}
                    </strong>
                    : {selectedGauntlet.winner.usernames.join(", ")}
                    {Number.isFinite(selectedGauntlet.winner.points) && (
                      <>
                        {" "}({selectedGauntlet.winner.points} pt{selectedGauntlet.winner.points === 1 ? "" : "s"})
                      </>
                    )}
                  </div>
                )}
              </div>
              {!canViewDetails ? (
                <div className={styles.joinGate}>
                  <div className={styles.joinGateTitle}>Join Gauntlet</div>
                  <div className={styles.joinGateBody}>
                    You must join this gauntlet before you can view the heat overview table.
                  </div>
                  {joinError && (
                    <div className={styles.joinGateError}>{joinError}</div>
                  )}
                  <button
                    type="button"
                    className={styles.joinGateButton}
                    onClick={handleJoinSelectedGauntlet}
                    disabled={isJoining}
                  >
                    {isJoining ? "Joining..." : "Join Gauntlet"}
                  </button>
                </div>
              ) : selectedGauntlet.heats.length === 0 ? (
                <p className={styles.p0}>No heats configured for this gauntlet yet.</p>
              ) : (
                <div className="table-wrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Platforms</th>
                      <th>Your game</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                        {selectedGauntlet.heats.map((h, index) => {
                          const user = h.user || {};
                          const game = user.selectedGame || null;
                          const year = game ? getGameYear(game) : null;
                          const currentStatus = statusByHeatId[h.id] || user.status || "UNBEATEN";
                          const statusLocked = isTerminalStatus(currentStatus);
                          const hasPool = !!(user.hasRolls || game);
                          const buttonLabel = hasPool ? "View roll pool" : "Go to game selection";

                          const now = new Date();
                          const startsAt = h.startsAt ? new Date(h.startsAt) : null;
                          let isHeatNotOpenYet = false;
                          if (startsAt && !Number.isNaN(startsAt.getTime())) {
                            const startOfDay = new Date(startsAt);
                            startOfDay.setHours(0, 0, 0, 0);
                            const openAt = new Date(startOfDay);
                            openAt.setDate(openAt.getDate() - 1);
                            if (now.getTime() < openAt.getTime()) {
                              isHeatNotOpenYet = true;
                            }
                          }

                          const endsAt = h.endsAt ? new Date(h.endsAt) : null;
                          let isHeatOver = false;
                          if (endsAt && !Number.isNaN(endsAt.getTime())) {
                            const endOfDay = new Date(endsAt);
                            endOfDay.setHours(23, 59, 59, 999);
                            if (now.getTime() > endOfDay.getTime()) {
                              isHeatOver = true;
                            }
                          }

                          const effectiveButtonLabel = isHeatOver ? "View roll pool" : buttonLabel;

                          let isLockedByPreviousHeat = false;
                          let previousHeatLabel = null;
                          if (index > 0) {
                            const prev = selectedGauntlet.heats[index - 1];
                            if (prev) {
                              const prevUser = prev.user || {};
                              const prevStatus = statusByHeatId[prev.id] || prevUser.status || "UNBEATEN";
                              if (prevStatus !== "BEATEN" && prevStatus !== "GIVEN_UP") {
                                isLockedByPreviousHeat = true;
                                previousHeatLabel = prev.name || `Heat ${prev.order}`;
                              }
                            }
                          }

                          return (
                            <tr key={h.id}>
                              <td>{h.name || `Heat ${h.order}`}</td>
                              <td>{formatDate(h.startsAt)}</td>
                              <td>{formatDate(h.endsAt)}</td>
                              <td>
                                {(h.platforms || []).map((p) => p.name).join(", ")}
                              </td>
                              <td>
                                {game ? (
                                  <span>
                                    {game.name}
                                    {year ? ` (${year})` : ""}
                                  </span>
                                ) : (
                                  <span className={styles.mutedItalic}>
                                    Not chosen yet
                                  </span>
                                )}
                              </td>
                              <td>
                                <select
                                  value={currentStatus}
                                  onChange={(e) =>
                                    handleStatusChange({
                                      heatId: h.id,
                                      nextStatus: e.target.value,
                                      prevStatus: currentStatus,
                                      heatName: h.name || `Heat ${h.order}`,
                                      gameName: game?.name || null
                                    })
                                  }
                                  disabled={
                                    isHeatOver ||
                                    isHeatNotOpenYet ||
                                    isLockedByPreviousHeat ||
                                    !game ||
                                    statusLocked
                                  }
                                  className={styles.select}
                                >
                                  {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                {isHeatNotOpenYet && !isHeatOver ? (
                                  <span className={styles.mutedItalic}>
                                    Heat not open yet - opens on {formatDate(new Date(new Date(h.startsAt).getTime() - 24 * 60 * 60 * 1000))}
                                  </span>
                                ) : isLockedByPreviousHeat && !isHeatOver ? (
                                  <span className={styles.mutedItalic}>
                                    Heat locked - complete previous heat{previousHeatLabel ? ` (${previousHeatLabel})` : ""}
                                  </span>
                                ) : (
                                  <Link
                                    prefetch={false}
                                    href={`/gauntlet/heat/${makeHeatSlug({
                                      gauntletName: selectedGauntlet.name,
                                      heatName: h.name || `Heat ${h.order}`,
                                      heatOrder: h.order
                                    })}`}
                                  >
                                    <button
                                      type="button"
                                      className={`${styles.actionButton} ${isHeatOver ? styles.actionButtonDim : ""}`}
                                    >
                                      {effectiveButtonLabel}
                                    </button>
                                  </Link>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
