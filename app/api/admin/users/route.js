import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

const sessionOptions = {
  password: process.env.IRON_SESSION_PASSWORD,
  cookieName: 'miklis_session',
  cookieOptions: { secure: process.env.NODE_ENV === 'production' }
};

export async function GET() {
  const session = await getIronSession(cookies(), sessionOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const users = await prisma.user.findMany({
    select: { id: true, username: true, isAdmin: true },
    orderBy: { username: 'asc' }
  });
  return NextResponse.json({ users });
}
