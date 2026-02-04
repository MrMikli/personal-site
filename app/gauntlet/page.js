import { redirect } from "next/navigation";
import { getSession } from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function GauntletPage() {
  const session = await getSession();
  if (!session.user) {
    redirect('/login');
  }
  return (
    <div>
      <h1>Retro Game Gauntlet</h1>
      <p>This page is accessible only to logged-in users. Content coming soon.</p>
    </div>
  );
}
