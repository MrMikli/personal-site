import { redirect } from "next/navigation";
import { getSession } from "../../lib/session";
import { prisma } from "@/lib/prisma";
import GauntletClient from "./GauntletClient";

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
          platforms: { select: { id: true, name: true, abbreviation: true } }
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

  for (const g of gauntlets) {
    const bucket = classify(g);
    if (bucket === "current") current.push(g);
    else if (bucket === "upcoming") upcoming.push(g);
    else previous.push(g);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Retro Game Gauntlet</h1>
      <p>Welcome, {session.user.username}</p>

      <section>
        <h2>Gauntlets</h2>
        <GauntletClient current={current} upcoming={upcoming} previous={previous} />
      </section>
    </div>
  );
}
