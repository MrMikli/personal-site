import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../../lib/session";
import { prisma } from "@/lib/prisma";
import SeedPlatformsClient from "./SeedPlatformsClient";
import ManagePlatformClient from "./ManagePlatformClient";

export const dynamic = "force-dynamic";

export default async function AdminGameManagementPage() {
  const session = await getSession();
  const user = session.user;
  if (!user?.isAdmin) {
    redirect("/");
  }

  const platforms = await prisma.platform.findMany({
    select: { id: true, igdbId: true, name: true, abbreviation: true },
    orderBy: { name: "asc" }
  });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Game Management</h1>
      <div>
        <Link href="/admin">← Back to Admin</Link>
      </div>

      <section>
        <h2>Platforms</h2>
        <p style={{ marginTop: 0 }}>Seed and sync platform catalog from IGDB.</p>
        <SeedPlatformsClient />
      </section>

      <section>
        <h2>Games</h2>
        <p style={{ marginTop: 0 }}>Select a platform to manage games.</p>
        <ManagePlatformClient platforms={platforms} />
      </section>
    </div>
  );
}
