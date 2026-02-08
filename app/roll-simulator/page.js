import { prisma } from "@/lib/prisma";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

import RollSimulatorClient from "./RollSimulatorClient";

export default async function RollSimulatorPage() {
  const platformsRaw = await prisma.platform.findMany({
    where: { games: { some: {} } },
    select: {
      id: true,
      name: true,
      abbreviation: true,
      _count: { select: { games: true } }
    },
    orderBy: { name: "asc" }
  });

  const platforms = platformsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    abbreviation: p.abbreviation || null,
    gamesCount: p._count.games
  }));

  return (
    <div className={styles.container}>
      <h1>Roll simulator</h1>
      <p className={styles.lede}>
        This is a sandbox roll simulator. It doesn&apos;t count for any gauntlet heat,
        doesn&apos;t save anything to the database, and isn&apos;t tied to any user
        account. You can use it without being logged in.
      </p>
      <RollSimulatorClient platforms={platforms} />
    </div>
  );
}
