import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { getSession } from "../../lib/session";
import { prisma } from "@/lib/prisma";
import GauntletClient from "./GauntletClient";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function GauntletPage() {
  noStore();
  const session = await getSession();
  if (!session.user) {
    redirect("/login");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const gauntlets = await prisma.gauntlet.findMany({
    orderBy: { name: "asc" },
    include: {
      heats: {
        orderBy: { order: "asc" },
        include: {
          platforms: { select: { id: true, name: true, abbreviation: true } },
          signups: {
            where: { userId: session.user.id },
            include: {
              selectedGame: {
                include: {
                  platforms: {
                    select: { id: true, name: true, abbreviation: true }
                  }
                }
              },
              rolls: {
                select: { id: true }
              }
            }
          }
        }
      }
    }
  });

  async function computeWinnerByGauntletId(gauntletIds) {
    const winnerById = new Map();
    if (!gauntletIds || gauntletIds.length === 0) return winnerById;

    const endedGauntlets = await prisma.gauntlet.findMany({
      where: { id: { in: gauntletIds } },
      select: {
        id: true,
        heats: { select: { id: true }, orderBy: { order: "asc" } },
        users: { select: { id: true, username: true } }
      }
    });

    const pointsByGauntlet = new Map();

    for (const g of endedGauntlets) {
      const byUserId = new Map();
      for (const u of g.users || []) {
        byUserId.set(u.id, { id: u.id, username: u.username, points: 0 });
      }
      pointsByGauntlet.set(g.id, byUserId);
    }

    const signups = await prisma.heatSignup.findMany({
      where: {
        heat: {
          gauntletId: { in: gauntletIds }
        }
      },
      select: {
        status: true,
        heat: { select: { gauntletId: true } },
        user: { select: { id: true, username: true } }
      }
    });

    for (const s of signups) {
      const gauntletId = s.heat?.gauntletId;
      const user = s.user;
      if (!gauntletId || !user) continue;

      if (!pointsByGauntlet.has(gauntletId)) {
        pointsByGauntlet.set(gauntletId, new Map());
      }

      const byUserId = pointsByGauntlet.get(gauntletId);
      if (!byUserId.has(user.id)) {
        byUserId.set(user.id, { id: user.id, username: user.username, points: 0 });
      }

      if (s.status === "BEATEN") {
        const row = byUserId.get(user.id);
        row.points += 1;
      }
    }

    for (const [gauntletId, byUserId] of pointsByGauntlet.entries()) {
      const rows = Array.from(byUserId.values());
      if (rows.length === 0) {
        winnerById.set(gauntletId, null);
        continue;
      }

      const maxPoints = rows.reduce((m, r) => (r.points > m ? r.points : m), 0);
      const winners = rows
        .filter((r) => r.points === maxPoints)
        .map((r) => r.username)
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)));

      winnerById.set(gauntletId, {
        usernames: winners,
        points: maxPoints
      });
    }

    return winnerById;
  }

  function classify(g) {
    if (!g.heats.length) return "upcoming";
    const minStart = g.heats.reduce((min, h) => {
      const d = h.startsAt ? new Date(h.startsAt) : null;
      if (!d || Number.isNaN(d.getTime())) return min;
      return !min || d < min ? d : min;
    }, null);
    const maxEnd = g.heats.reduce((max, h) => {
      const d = h.endsAt ? new Date(h.endsAt) : null;
      if (!d || Number.isNaN(d.getTime())) return max;
      return !max || d > max ? d : max;
    }, null);

    if (!minStart || !maxEnd) return "upcoming";

    const todayTime = today.getTime();
    const startTime = minStart.setHours(0, 0, 0, 0);
    const endTime = maxEnd.setHours(23, 59, 59, 999);

    if (todayTime < startTime) return "upcoming";
    if (todayTime > endTime) return "previous";
    return "current";
  }

  const current = [];
  const upcoming = [];
  const previous = [];

  const bucketByGauntletId = new Map();
  const previousIds = [];

  for (const g of gauntlets) {
    const bucket = classify(g);
    bucketByGauntletId.set(g.id, bucket);
    if (bucket === "previous") previousIds.push(g.id);
  }

  const winnerByGauntletId = await computeWinnerByGauntletId(previousIds);

  const mapHeat = (h) => {
    const signup = h.signups && h.signups[0] ? h.signups[0] : null;
    const selectedGame = signup?.selectedGame
      ? {
          id: signup.selectedGame.id,
          name: signup.selectedGame.name,
          slug: signup.selectedGame.slug,
          coverUrl: signup.selectedGame.coverUrl,
          releaseDateUnix: signup.selectedGame.releaseDateUnix,
          releaseDateHuman: signup.selectedGame.releaseDateHuman,
          platforms: (signup.selectedGame.platforms || []).map((p) => ({
            id: p.id,
            name: p.name,
            abbreviation: p.abbreviation || null
          }))
        }
      : null;

    const hasRolls = signup ? (signup.rolls || []).length > 0 : false;
    const status = signup?.status || "UNBEATEN";

    return {
      id: h.id,
      name: h.name,
      order: h.order,
      startsAt: h.startsAt,
      endsAt: h.endsAt,
      defaultGameCounter: h.defaultGameCounter,
      platforms: (h.platforms || []).map((p) => ({
        id: p.id,
        name: p.name,
        abbreviation: p.abbreviation || null
      })),
      user: {
        status,
        hasRolls,
        selectedGame
      }
    };
  };

  for (const g of gauntlets) {
    const bucket = bucketByGauntletId.get(g.id) || "upcoming";
    const mapped = {
      id: g.id,
      name: g.name,
      heats: (g.heats || []).map(mapHeat),
      winner: bucket === "previous" ? (winnerByGauntletId.get(g.id) ?? null) : null
    };
    if (bucket === "current") current.push(mapped);
    else if (bucket === "upcoming") upcoming.push(mapped);
    else previous.push(mapped);
  }

  return (
    <div className={styles.container}>
      <h1>Retro Game Gauntlet</h1>
      <p>Welcome, {session.user.username}</p>

      <a href="/gauntlet/rules"> I don't get it (idgi)</a>
      <section>
        <h2>Gauntlets</h2>
        <GauntletClient current={current} upcoming={upcoming} previous={previous} />
      </section>
    </div>
  );
}
