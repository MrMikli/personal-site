import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { getSession } from "../../../../lib/session";
import { prisma } from "@/lib/prisma";
import HeatRollClient from "../HeatRollClient";
import styles from "./page.module.css";
import { makeHeatSlug, parseHeatSlug, slugify } from "@/lib/slug";
import { addUtcDaysMs, formatDateOnlyUTC, getUtcDayBoundsMs } from "@/lib/dateOnly";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function ensureUserCanViewGauntletDetails({ gauntletId, userId }) {
  if (!gauntletId || !userId) return false;

  const gauntlet = await prisma.gauntlet.findUnique({
    where: { id: gauntletId },
    select: {
      users: { where: { id: userId }, select: { id: true } },
      heats: { select: { endsAt: true } }
    }
  });

  if (!gauntlet) return false;

  const heats = gauntlet.heats || [];
  const nowMs = Date.now();
  const maxEnd = heats.reduce((max, h) => {
    const d = h?.endsAt ? new Date(h.endsAt) : null;
    if (!d || Number.isNaN(d.getTime())) return max;
    return !max || d > max ? d : max;
  }, null);

  const gauntletOver = (() => {
    if (!maxEnd) return false;
    const bounds = getUtcDayBoundsMs(maxEnd);
    if (!bounds) return false;
    return nowMs > bounds.end;
  })();

  if (gauntletOver) return true;

  const isMember = Array.isArray(gauntlet.users) && gauntlet.users.length > 0;
  if (isMember) return true;

  // Back-compat: anyone who already rolled/picked/statused a heat (HeatSignup exists)
  // should still be able to view this gauntlet’s details.
  const legacySignup = await prisma.heatSignup.findFirst({
    where: {
      userId,
      heat: { gauntletId }
    },
    select: { id: true }
  });

  return !!legacySignup;
}

export default async function HeatGameSelectionPage({ params }) {
  noStore();
  const session = await getSession();
  if (!session.user) {
    redirect("/login");
  }

  const heatParam = params.heatId;

  // Back-compat: if someone hits /heat/<heatId>, redirect to the canonical slug URL.
  const byId = await prisma.heat.findUnique({
    where: { id: heatParam },
    select: {
      id: true,
      order: true,
      name: true,
      gauntletId: true,
      gauntlet: { select: { name: true } }
    }
  });

  if (byId) {
    const canView = await ensureUserCanViewGauntletDetails({
      gauntletId: byId.gauntletId,
      userId: session.user.id
    });
    if (!canView) {
      redirect("/gauntlet");
    }

    const slug = makeHeatSlug({
      gauntletName: byId.gauntlet?.name || "gauntlet",
      heatName: byId.name || `Heat ${byId.order}`,
      heatOrder: byId.order
    });
    redirect(`/gauntlet/heat/${slug}`);
  }

  const parsed = parseHeatSlug(heatParam);
  if (!parsed) {
    redirect("/gauntlet");
  }

  const gauntlets = await prisma.gauntlet.findMany({
    select: { id: true, name: true }
  });

  const matchedGauntlet = gauntlets.find((g) => slugify(g.name) === parsed.gauntletSlug) || null;
  if (!matchedGauntlet) {
    redirect("/gauntlet");
  }

  const heat = await prisma.heat.findFirst({
    where: {
      gauntletId: matchedGauntlet.id,
      order: parsed.order
    },
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
              },
              platform: { select: { id: true, name: true, abbreviation: true } }
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

  const canView = await ensureUserCanViewGauntletDetails({
    gauntletId: heat.gauntletId,
    userId: session.user.id
  });
  if (!canView) {
    redirect("/gauntlet");
  }

  // If the slug's name parts don't match (e.g., heat renamed), redirect to canonical.
  const canonicalSlug = makeHeatSlug({
    gauntletName: heat.gauntlet?.name || "gauntlet",
    heatName: heat.name || `Heat ${heat.order}`,
    heatOrder: heat.order
  });
  if (heatParam !== canonicalSlug) {
    redirect(`/gauntlet/heat/${canonicalSlug}`);
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

  const nowMs2 = Date.now();

  const startsBounds = getUtcDayBoundsMs(heat.startsAt);
  const opensAtMs = startsBounds ? addUtcDaysMs(startsBounds.start, -1) : null;
  const isHeatNotOpenYet = opensAtMs != null ? nowMs2 < opensAtMs : false;
  const opensAtLabel = opensAtMs != null ? formatDateOnlyUTC(opensAtMs) : null;

  const endsBounds = getUtcDayBoundsMs(heat.endsAt);
  const isHeatOver = endsBounds ? nowMs2 > endsBounds.end : false;

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
        <Link href="/gauntlet" prefetch={false}>
          ← Back to gauntlet overview
        </Link>
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
