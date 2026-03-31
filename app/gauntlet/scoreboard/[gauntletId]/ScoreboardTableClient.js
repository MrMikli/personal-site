"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import styles from "./page.module.css";

const STATUS_LABELS = {
  UNBEATEN: "?",
  BEATEN: "KING GAMER",
  GIVEN_UP: "FAT LOSER"
};

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

function TrophyIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        fill="currentColor"
        d="M19 4h-2V3H7v1H5a1 1 0 0 0-1 1v2a5 5 0 0 0 5 5h.1A5.99 5.99 0 0 0 11 14.9V17H8v2h8v-2h-3v-2.1A5.99 5.99 0 0 0 14.9 12H15a5 5 0 0 0 5-5V5a1 1 0 0 0-1-1M6 7V6h1v4.9A3 3 0 0 1 6 7m12 0a3 3 0 0 1-1 3.9V6h1Z"
      />
    </svg>
  );
}

export default function ScoreboardTableClient({
  gauntletId,
  heats,
  participants,
  winnerUserId
}) {
  const [collapsedHeatIds, setCollapsedHeatIds] = useState(() => new Set());

  const toggleHeat = useCallback((heatId) => {
    setCollapsedHeatIds((prev) => {
      const next = new Set(prev);
      if (next.has(heatId)) next.delete(heatId);
      else next.add(heatId);
      return next;
    });
  }, []);

  const heatTitlesById = useMemo(() => {
    const map = new Map();
    for (const h of heats || []) {
      map.set(h.id, h.name || `Heat ${h.order}`);
    }
    return map;
  }, [heats]);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="table-center">Player</th>
            <th className="table-center font-tabular table-col-max-80">Points</th>
            {(heats || []).map((h) => {
              const collapsed = collapsedHeatIds.has(h.id);
              const heatTitle = heatTitlesById.get(h.id) || "Heat";

              return (
                <th
                  key={h.id}
                  className={collapsed ? styles.heatHeaderCollapsed : "table-col-min-220"}
                >
                  {collapsed ? (
                    <div className={styles.heatHeaderCollapsedInner}>
                      <span className={styles.heatHeaderEllipsis} aria-hidden="true">
                        ...
                      </span>
                      <button
                        type="button"
                        className={styles.heatToggleButton}
                        onClick={() => toggleHeat(h.id)}
                        aria-label={`Expand ${heatTitle}`}
                        title={`Expand ${heatTitle}`}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <div className={styles.heatHeaderExpanded}>
                      <div className={styles.heatHeaderRow}>
                        <div className="cell-title">{heatTitle}</div>
                        <button
                          type="button"
                          className={styles.heatToggleButton}
                          onClick={() => toggleHeat(h.id)}
                          aria-label={`Collapse ${heatTitle}`}
                          title={`Collapse ${heatTitle}`}
                        >
                          −
                        </button>
                      </div>
                      <div className="cell-subtitle text-muted">
                        Selected game + status
                      </div>
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {(participants || []).length === 0 ? (
            <tr>
              <td
                colSpan={2 + (heats || []).length}
                className={`${styles.emptyCell} text-muted`.trim()}
              >
                No participants yet.
              </td>
            </tr>
          ) : (
            (participants || []).map((p) => (
              <tr key={p.id}>
                <td className="table-center">
                  <div className={styles.playerCell}>
                    <div className={styles.playerName}>
                      {p.username}
                      {winnerUserId === p.id && <TrophyIcon className={styles.trophy} />}
                    </div>
                    <Link
                      className={styles.seeRollsLink}
                      href={`/profile/${encodeURIComponent(
                        p.username
                      )}?gauntletId=${encodeURIComponent(gauntletId)}`}
                    >
                      See all rolls
                    </Link>
                  </div>
                </td>
                <td className="table-center font-tabular">{p.points}</td>

                {(heats || []).map((h) => {
                  const collapsed = collapsedHeatIds.has(h.id);

                  if (collapsed) {
                    return <td key={h.id} className={styles.heatCellCollapsed} />;
                  }

                  const cell = p.perHeat?.[h.id] || null;
                  const status = cell?.status || null;
                  const game = cell?.game || null;
                  const year = game ? getGameYear(game) : null;

                  const gameLabel = game
                    ? `${game.name}${year ? ` (${year})` : ""}`
                    : cell
                      ? "No game picked"
                      : "-";

                  const statusLabel = status
                    ? STATUS_LABELS[status] || status
                    : "";

                  const statusClass =
                    status === "BEATEN"
                      ? "text-status-beaten"
                      : status === "GIVEN_UP"
                        ? "text-status-givenup"
                        : "text-status-unbeaten";

                  return (
                    <td key={h.id}>
                      <div className="cell-stack">
                        <div
                          className={`cell-title ${game ? "" : "text-muted"}`.trim()}
                        >
                          {gameLabel}
                        </div>
                        {statusLabel && (
                          <div
                            className={`cell-subtitle ${statusClass}`.trim()}
                          >
                            Status: {statusLabel}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
