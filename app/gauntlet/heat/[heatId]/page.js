import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../../../lib/session";
import { prisma } from "@/lib/prisma";

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
      platforms: { select: { id: true, name: true, abbreviation: true } }
    }
  });

  if (!heat) {
    redirect("/gauntlet");
  }

  const platformsLabel = heat.platforms
    .map((p) => (p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name))
    .join(", ");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <Link href="/gauntlet">← Back to gauntlet overview</Link>
      </div>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ marginBottom: 4 }}>{heat.gauntlet.name}</h1>
        <h2 style={{ marginTop: 0, fontWeight: 500 }}>
          {heat.name || `Heat ${heat.order}`}
        </h2>
        <p style={{ fontStyle: "italic", color: "#555", marginTop: 8 }}>
          Platforms: {platformsLabel || "(none configured)"}
        </p>
      </div>
    </div>
  );
}
