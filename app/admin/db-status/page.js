import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminDbStatusPage() {
  const session = await getSession();
  if (!session.user?.isAdmin) {
    redirect('/');
  }
  try {
    const UserCount = await prisma.user.count();
    const PlatformCount = await prisma.platform.count();
    const GameCount = await prisma.game.count();
    return (
      <div>
        <h1>Database Status</h1>
        <p><strong>Status:</strong> Connected</p>
        <p>Users in DB: {UserCount}</p>
        <p>Platforms in DB: {PlatformCount}</p>
        <p>Games in DB: {GameCount}</p>
      </div>
    );
  } catch {
    return (
      <div>
        <h1>Database Status</h1>
        <p><strong>Status:</strong> Disconnected</p>
        <p>Could not query the database.</p>
      </div>
    );
  }
}
