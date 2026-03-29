import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import styles from "./page.module.css";
import { getUtcDayBoundsMs } from "@/lib/dateOnly";
import ScoreboardTableClient from "./ScoreboardTableClient";

export const dynamic = "force-dynamic";

function toSerializableGame(game) {
  if (!game) return null;

  const releaseDateUnix =
    typeof game.releaseDateUnix === "bigint"
      ? game.releaseDateUnix.toString()
      : game.releaseDateUnix;

  return {
    id: game.id,
    name: game.name,
    releaseDateUnix,
    releaseDateHuman: game.releaseDateHuman
  };
}

export default async function ScoreboardPage({ params, searchParams }) {
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
      game: toSerializableGame(s.selectedGame)
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
  const heatsForClient = heats.map((h) => ({ id: h.id, order: h.order, name: h.name }));

  return (
    <div className={styles.container}>
      {searchParams?.from === "gauntlet" ? (
        <div>
          <Link href="/gauntlet">← Back to gauntlet overview</Link>
        </div>
      ) : null}

      <div className={styles.center}>
        <h1 className={styles.title}>{gauntlet.name} - Scoreboard</h1>
        <div className={styles.note}>
          1 point per heat marked as <strong>Beaten</strong>
        </div>
      </div>

      {heats.length === 0 ? (
        <p className={styles.p0}>No heats configured for this gauntlet yet.</p>
      ) : (
        <ScoreboardTableClient
          gauntletId={gauntletId}
          heats={heatsForClient}
          participants={participants}
          winnerUserId={winnerUserId}
        />
      )}
    </div>
  );
}
