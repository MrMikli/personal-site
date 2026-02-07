import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../../../lib/session";
import { prisma } from "@/lib/prisma";
import HeatRollClient from "../HeatRollClient";

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

  const now = new Date();
  const endsAt = heat.endsAt ? new Date(heat.endsAt) : null;
  let isHeatOver = false;
  if (endsAt && !Number.isNaN(endsAt.getTime())) {
    const endOfDay = new Date(endsAt);
    endOfDay.setHours(23, 59, 59, 999);
    if (now.getTime() > endOfDay.getTime()) {
      isHeatOver = true;
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <Link href="/gauntlet">← Back to gauntlet overview</Link>
      </div>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ marginBottom: 4 }}>{heat.gauntlet.name}</h1>
        <h2 style={{ marginTop: 0, fontWeight: 500 }}>
          {heat.name || `Heat ${heat.order}`}
        </h2>
        <p style={{ fontStyle: "italic", color: "#555", marginTop: 8 }}>
          Platforms: {platformsLabel || "(none configured)"} <br />
          [{gameCountLabel} game roll pool]
        </p>
      </div>
      <HeatRollClient
        heatId={heat.id}
        defaultGameCounter={heat.defaultGameCounter}
        platforms={heat.platforms}
        initialRolls={initialRolls}
        initialTargets={initialTargets}
        initialSelectedGameId={initialSelectedGameId}
        isHeatOver={isHeatOver}
        isAdmin={!!session.user.isAdmin}
      />
    </div>
  );
}
