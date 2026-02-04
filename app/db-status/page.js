import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession } from '../../lib/session';

export const dynamic = 'force-dynamic';

export default async function DbStatusPage() {
  const session = await getSession();
  if (!session.user?.isAdmin) {
    redirect('/');
  }
  try {
    const count = await prisma.user.count();
    return (
      <div>
        <h1>Database Status</h1>
        <p><strong>Status:</strong> Connected</p>
        <p>Users in DB: {count}</p>
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
