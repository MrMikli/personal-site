import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../../../lib/session";
import { prisma } from "@/lib/prisma";
import HeatRollClient from "../HeatRollClient";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function HeatGameSelectionPage({ params }) {
  const session = await getSession();
  if (!session.user) {
    redirect("/login");
  }

  const heatId = params.heatId;

  const heat = await prisma.heat.findUnique({
    where: { id: heatId },
    include: {
      gauntlet: { select: { id: true, name: true } },
      platforms: { select: { id: true, name: true, abbreviation: true } },
      signups: {
        where: { userId: session.user.id },
        include: {
          rolls: {
            orderBy: { order: "asc" },
            include: {
              game: {
                include: {
                  platforms: { select: { id: true, name: true, abbreviation: true } }
                }
              }
            }
          },
          selectedGame: {
            include: {
              platforms: { select: { id: true, name: true, abbreviation: true } }
            }
          }
        }
      }
    }
  });

  if (!heat) {
    redirect("/gauntlet");
  }

  const platformsLabel = heat.platforms
    .map((p) => (p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name))
    .join(", ");
  const gameCountLabel = heat.defaultGameCounter;

  const signup = heat.signups?.[0] || null;
  const initialRolls = signup?.rolls || [];
  const initialTargets = signup?.platformTargets || null;
  const initialSelectedGameId = signup?.selectedGameId || null;
  const initialWesternRequired = signup?.westernRequired ?? 0;

  const now = new Date();

  const startsAt = heat.startsAt ? new Date(heat.startsAt) : null;
  let isHeatNotOpenYet = false;
  let opensAtLabel = null;
  if (startsAt && !Number.isNaN(startsAt.getTime())) {
    const startOfDay = new Date(startsAt);
    startOfDay.setHours(0, 0, 0, 0);
    const openAt = new Date(startOfDay);
    openAt.setDate(openAt.getDate() - 1);
    isHeatNotOpenYet = now.getTime() < openAt.getTime();
    opensAtLabel = openAt.toLocaleDateString();
  }

  const endsAt = heat.endsAt ? new Date(heat.endsAt) : null;
  let isHeatOver = false;
  if (endsAt && !Number.isNaN(endsAt.getTime())) {
    const endOfDay = new Date(endsAt);
    endOfDay.setHours(23, 59, 59, 999);
    if (now.getTime() > endOfDay.getTime()) {
      isHeatOver = true;
    }
  }

  let isLockedByPreviousHeat = false;
  let previousHeatLabel = null;
  if (!isHeatOver) {
    const prevHeat = await prisma.heat.findFirst({
      where: {
        gauntletId: heat.gauntletId,
        order: { lt: heat.order }
      },
      orderBy: { order: "desc" },
      select: { id: true, name: true, order: true }
    });

    if (prevHeat) {
      previousHeatLabel = prevHeat.name || `Heat ${prevHeat.order}`;
      const prevSignup = await prisma.heatSignup.findUnique({
        where: {
          heatId_userId: { heatId: prevHeat.id, userId: session.user.id }
        },
        select: { status: true }
      });

      const prevStatus = prevSignup?.status || "UNBEATEN";
      if (prevStatus !== "BEATEN" && prevStatus !== "GIVEN_UP") {
        isLockedByPreviousHeat = true;
      }
    }
  }

  const isInteractionLocked = isHeatNotOpenYet || isLockedByPreviousHeat;

  return (
    <div className={styles.container}>
      <div>
        <Link href="/gauntlet">← Back to gauntlet overview</Link>
      </div>
      <div className={styles.center}>
        <h1 className={styles.title}>{heat.gauntlet.name}</h1>
        <h2 className={styles.subtitle}>
          {heat.name || `Heat ${heat.order}`}
        </h2>
        <p className={styles.meta}>
          Platforms: {platformsLabel || "(none configured)"} <br />
          [{gameCountLabel} game roll pool]
        </p>
      </div>
      {isHeatNotOpenYet && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <div className={styles.bannerTitle}>This heat isn't open yet</div>
          <div className={styles.bannerBody}>
            You can start interacting with this heat starting the day before it begins.
            {opensAtLabel ? ` (Opens: ${opensAtLabel})` : ""}
          </div>
        </div>
      )}

      {isLockedByPreviousHeat && (
        <div className={`${styles.banner} ${styles.bannerDanger}`}>
          <div className={styles.bannerTitle}>This heat is locked</div>
          <div className={styles.bannerBody}>
            You must mark the previous heat as completed or given up before interacting with this one.
            {previousHeatLabel ? ` (Previous: ${previousHeatLabel})` : ""}
          </div>
        </div>
      )}

      <div className={isInteractionLocked ? styles.locked : undefined} aria-hidden={isInteractionLocked ? "true" : undefined}>
        <HeatRollClient
          heatId={heat.id}
          defaultGameCounter={heat.defaultGameCounter}
          platforms={heat.platforms}
          initialRolls={initialRolls}
          initialTargets={initialTargets}
          initialSelectedGameId={initialSelectedGameId}
          initialWesternRequired={initialWesternRequired}
          isHeatOver={isHeatOver}
          isAdmin={!!session.user.isAdmin}
        />
      </div>
    </div>
  );
}
