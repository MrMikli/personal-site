import { redirect } from "next/navigation";
import { getSession } from "../../lib/session";
import { prisma } from "@/lib/prisma";
import GauntletClient from "./GauntletClient";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function GauntletPage() {
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
    const bucket = classify(g);
    const mapped = {
      id: g.id,
      name: g.name,
      heats: (g.heats || []).map(mapHeat)
    };
    if (bucket === "current") current.push(mapped);
    else if (bucket === "upcoming") upcoming.push(mapped);
    else previous.push(mapped);
  }

  return (
    <div className={styles.container}>
      <h1>Retro Game Gauntlet</h1>
      <p>Welcome, {session.user.username}</p>

      <section>
        <h2>Gauntlets</h2>
        <GauntletClient current={current} upcoming={upcoming} previous={previous} />
      </section>
    </div>
  );
}
