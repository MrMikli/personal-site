import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/session";
import UsersList from "./users-list";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  const user = session.user;
  if (!user?.isAdmin) {
    redirect('/');
  }
  return (
    <div>
      <h1>Admin</h1>
      <ul style={{ display: 'grid', gap: 8, paddingLeft: 0, listStyle: 'none', marginBottom: 16 }}>
        <li><Link href="/admin/db-status">DB Status</Link></li>
        <li><Link href="/admin/db-game-settings">DB Game Settings</Link></li>
        <li><Link href="/admin/gauntlets">Gauntlets</Link></li>
      </ul>
      <section>
        <h2>Users</h2>
        <UsersList />
      </section>
    </div>
  );
}
