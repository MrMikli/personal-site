import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../../lib/session";
import SeedPlatformsClient from "./SeedPlatformsClient";

export const dynamic = "force-dynamic";

export default async function AdminDbGameSettingsPage() {
  const session = await getSession();
  const user = session.user;
  if (!user?.isAdmin) {
    redirect("/");
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>DB Game Settings</h1>
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
        <p style={{ marginTop: 0 }}>
          Admins can populate game lists per platform later. This page will host those tools.
        </p>
      </section>
    </div>
  );
}
