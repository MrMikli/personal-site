"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

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

function statusLabel(status) {
  if (status === "BEATEN") return { text: "Beaten", className: styles.statusBeaten };
  if (status === "GIVEN_UP") return { text: "Given up", className: styles.statusGivenUp };
  return { text: "Unbeaten", className: styles.statusUnbeaten };
}

export default function UserRollsClient({ user, gauntlets, initialGauntletId }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedGauntletId, setSelectedGauntletId] = useState(() => {
    if (initialGauntletId && gauntlets.some((g) => g.id === initialGauntletId)) return initialGauntletId;
    return gauntlets[0]?.id || "";
  });

  const selectedGauntlet = useMemo(
    () => gauntlets.find((g) => g.id === selectedGauntletId) || null,
    [gauntlets, selectedGauntletId]
  );

  function selectGauntlet(id) {
    setSelectedGauntletId(id);
    const next = new URLSearchParams(searchParams.toString());
    next.set("gauntletId", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  if (!gauntlets.length) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Roll history: {user.username}</h1>
          <p className={styles.subtitle}>No gauntlets found for this user.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Roll history: {user.username}</h1>
        <p className={styles.subtitle}>Browse rolls, picks, and weekly outcomes by gauntlet.</p>
      </div>

      <div className={styles.selector}>
        {gauntlets.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => selectGauntlet(g.id)}
            className={`${styles.pill} ${g.id === selectedGauntletId ? styles.pillActive : ""}`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {selectedGauntlet && (
        <div className={styles.card}>
          {selectedGauntlet.heats.length === 0 ? (
            <p className={styles.muted}>No heats configured for this gauntlet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th>Heat</th>
                    <th>Dates</th>
                    <th>Picked</th>
                    <th>Status</th>
                    <th>All rolls</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGauntlet.heats.map((h) => {
                    const signup = h.signup || null;
                    const picked = signup?.selectedGame || null;
                    const pickedYear = picked ? getGameYear(picked) : null;
                    const status = signup?.status || "UNBEATEN";
                    const label = statusLabel(status);

                    const rolls = Array.isArray(signup?.rolls) ? signup.rolls : [];

                    return (
                      <tr key={h.id}>
                        <td>
                          <div className="cell-title">{h.name || `Heat ${h.order}`}</div>
                        </td>
                        <td>
                          <div className="cell-stack">
                            <div className="cell-title">{formatDate(h.startsAt)} → {formatDate(h.endsAt)}</div>
                            <div className="cell-subtitle text-muted">{(h.platforms || []).map((p) => p.name).join(", ")}</div>
                          </div>
                        </td>
                        <td>
                          {picked ? (
                            <div className="cell-stack">
                              <div className="cell-title">{picked.name}{pickedYear ? ` (${pickedYear})` : ""}</div>
                              <div className="cell-subtitle text-muted">
                                {(picked.platforms || []).map((p) => p.name).join(", ")}
                              </div>
                            </div>
                          ) : signup ? (
                            <span className={styles.muted}>No game picked</span>
                          ) : (
                            <span className={styles.muted}>No signup</span>
                          )}
                        </td>
                        <td>
                          <span className={label.className}>{label.text}</span>
                        </td>
                        <td>
                          {rolls.length === 0 ? (
                            <span className={styles.muted}>No rolls</span>
                          ) : (
                            <div className={styles.rollList}>
                              {rolls.map((r) => {
                                const year = getGameYear(r.game);
                                const platformLabel = r.platform?.abbreviation || r.platform?.name || "";
                                return (
                                  <div key={r.id} className={styles.rollItem}>
                                    #{r.order}: {r.game?.name}{year ? ` (${year})` : ""}{platformLabel ? ` — ${platformLabel}` : ""}
                                  </div>
                                );
                              })}
                            </div>
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
  );
}
