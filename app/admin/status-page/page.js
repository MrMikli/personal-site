import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminStatusPage() {
  const session = await getSession();
  if (!session.user?.isAdmin) {
    redirect('/');
  }
  try {
    const UserCount = await prisma.user.count();
    const PlatformCount = await prisma.platform.count();
    const platformsWithGames = await prisma.platform.findMany({
      where: { games: { some: {} } },
      select: {
        name: true,
        abbreviation: true,
        _count: { select: { games: true } }
      },
      orderBy: { name: 'asc' }
    });
    return (
      <div>
        <h1>Database Status</h1>
        <p><strong>Status:</strong> Connected</p>
        <p>Users in DB: {UserCount}</p>
        <p>Platforms in DB: {PlatformCount}</p>
        <section style={{ marginTop: 16 }}>
          <h2>Games Per Platform</h2>
          {platformsWithGames.length === 0 ? (
            <p>No games synced yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', paddingLeft: 0, display: 'grid', gap: 6 }}>
              {platformsWithGames.map(p => (
                <li key={`${p.name}-${p.abbreviation || ''}`}>
                  <span>
                    {p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name}: {p._count.games}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
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
