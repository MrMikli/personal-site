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
      <p>Welcome, {session.user.username}</p>
      <h2>Current Gauntlet:</h2>
      <p>None yet!</p>
    </div>
  );
}
