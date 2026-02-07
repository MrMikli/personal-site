import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { fetchAllPlatforms } from '@/lib/igdb';

export async function POST() {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const igdbPlatforms = await fetchAllPlatforms();
    const data = igdbPlatforms.map(p => ({
      igdbId: p.id,
      name: p.name,
      abbreviation: p.abbreviation ?? null,
      generation: p.generation ?? null
    }));

    const result = await prisma.platform.createMany({
      data,
      skipDuplicates: true
    });

    return NextResponse.json({ inserted: result.count, totalFetched: igdbPlatforms.length });
  } catch (err) {
    return NextResponse.json({ message: 'Failed to seed platforms', error: String(err) }, { status: 500 });
  }
}
