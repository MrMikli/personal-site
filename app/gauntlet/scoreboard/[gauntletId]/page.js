import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import styles from "./page.module.css";
import { getUtcDayBoundsMs } from "@/lib/dateOnly";

export const dynamic = "force-dynamic";

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

const STATUS_LABELS = {
  UNBEATEN: "Unbeaten",
  BEATEN: "Beaten",
  GIVEN_UP: "Given up"
};

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

export default async function ScoreboardPage({ params }) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const gauntletId = params?.gauntletId;
  if (!gauntletId) {
    redirect("/gauntlet");
  }

  const gauntlet = await prisma.gauntlet.findUnique({
    where: { id: gauntletId },
    include: {
      heats: {
        orderBy: { order: "asc" },
        select: { id: true, order: true, name: true, endsAt: true }
      },
      users: {
        select: { id: true, username: true }
      }
    }
  });

  if (!gauntlet) {
    redirect("/gauntlet");
  }

  const signups = await prisma.heatSignup.findMany({
    where: {
      heat: {
        gauntletId
      }
    },
    select: {
      status: true,
      heatId: true,
      user: { select: { id: true, username: true } },
      selectedGame: {
        select: {
          id: true,
          name: true,
          releaseDateUnix: true,
          releaseDateHuman: true
        }
      }
    }
  });

  const heats = gauntlet.heats || [];

  // Gauntlet is considered "over" once the end date of the last heat has concluded.
  const nowMs = Date.now();
  const maxEnd = heats.reduce((max, h) => {
    const d = h.endsAt ? new Date(h.endsAt) : null;
    if (!d || Number.isNaN(d.getTime())) return max;
    return !max || d > max ? d : max;
  }, null);
  const gauntletOver = (() => {
    if (!maxEnd) return false;
    const bounds = getUtcDayBoundsMs(maxEnd);
    if (!bounds) return false;
    return nowMs > bounds.end;
  })();

  // For current/upcoming gauntlets, require explicit membership to see details.
  if (!gauntletOver) {
    const isMember = (gauntlet.users || []).some((u) => String(u.id) === String(session.user.id));
    const hasLegacySignup = signups.some((s) => String(s.user?.id) === String(session.user.id));
    if (!isMember && !hasLegacySignup) {
      redirect("/gauntlet");
    }
  }

  const participantsById = new Map();

  // Include all gauntlet participants (even if they haven't signed up for a heat yet)
  for (const u of gauntlet.users || []) {
    participantsById.set(u.id, {
      id: u.id,
      username: u.username,
      points: 0,
      perHeat: {}
    });
  }

  // Overlay per-heat signup info
  for (const s of signups) {
    const user = s.user;
    if (!user) continue;

    if (!participantsById.has(user.id)) {
      participantsById.set(user.id, {
        id: user.id,
        username: user.username,
        points: 0,
        perHeat: {}
      });
    }

    const row = participantsById.get(user.id);
    row.perHeat[s.heatId] = {
      status: s.status,
      game: s.selectedGame
    };
  }

  // Calculate points (1 point per BEATEN heat)
  for (const row of participantsById.values()) {
    let points = 0;
    for (const heat of heats) {
      const cell = row.perHeat[heat.id];
      if (cell?.status === "BEATEN") points += 1;
    }
    row.points = points;
  }

  const participants = Array.from(participantsById.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return String(a.username || "").localeCompare(String(b.username || ""));
  });

  const maxPoints = participants.length ? participants[0].points : 0;
  const topCount = participants.filter((p) => p.points === maxPoints).length;
  const hasSingleWinner = gauntletOver && participants.length > 0 && topCount === 1;
  const winnerUserId = hasSingleWinner ? participants[0].id : null;

  return (
    <div className={styles.container}>
      <div>
        <Link href="/gauntlet">← Back to gauntlet</Link>
      </div>

      <div className={styles.center}>
        <h1 className={styles.title}>{gauntlet.name} - Scoreboard</h1>
        <div className={styles.note}>
          1 point per heat marked as <strong>Beaten</strong>
        </div>
      </div>

      {heats.length === 0 ? (
        <p className={styles.p0}>No heats configured for this gauntlet yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="table-center">
                  Player
                </th>
                <th className="table-center font-tabular table-col-max-80">
                  Points
                </th>
                {heats.map((h) => (
                  <th
                    key={h.id}
                    className="table-col-min-220"
                  >
                    <div className="cell-title">{h.name || `Heat ${h.order}`}</div>
                    <div className="cell-subtitle text-muted">Selected game + status</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {participants.length === 0 ? (
                <tr>
                  <td colSpan={2 + heats.length} className={`${styles.emptyCell} text-muted`.trim()}>
                    No participants yet.
                  </td>
                </tr>
              ) : (
                participants.map((p) => (
                  <tr key={p.id}>
                    <td className="table-center">
                      <div className={styles.playerCell}>
                        <div className={styles.playerName}>
                          {p.username}
                          {winnerUserId === p.id && (
                            <TrophyIcon className={styles.trophy} />
                          )}
                        </div>
                        <Link className={styles.seeRollsLink} href={`/gauntlet/users/${encodeURIComponent(p.username)}?gauntletId=${gauntletId}`}>
                          See all rolls
                        </Link>
                      </div>
                    </td>
                    <td className="table-center font-tabular">
                      {p.points}
                    </td>
                    {heats.map((h) => {
                      const cell = p.perHeat[h.id] || null;
                      const status = cell?.status || null;
                      const game = cell?.game || null;
                      const year = game ? getGameYear(game) : null;

                      const gameLabel = game
                        ? `${game.name}${year ? ` (${year})` : ""}`
                        : cell
                          ? "No game picked"
                          : "-";

                      const statusLabel = status ? (STATUS_LABELS[status] || status) : "";

                      const statusClass =
                        status === "BEATEN"
                          ? "text-status-beaten"
                          : status === "GIVEN_UP"
                            ? "text-status-givenup"
                            : "text-status-unbeaten";

                      return (
                        <td key={h.id}>
                          <div className="cell-stack">
                            <div className={`cell-title ${game ? "" : "text-muted"}`.trim()}>
                              {gameLabel}
                            </div>
                            {statusLabel && (
                              <div className={`cell-subtitle ${statusClass}`.trim()}>
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
      )}
    </div>
  );
}
