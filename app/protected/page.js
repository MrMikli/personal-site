import { redirect } from "next/navigation";
import { getSession } from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function ProtectedPage() {
  const session = await getSession();
  if (!session.user) {
    redirect('/login');
  }

  return (
    <div>
      <h1>Protected</h1>
      <p>Welcome, {session.user.email}.</p>
      <p>This page is only visible when logged in.</p>
    </div>
  );
}
