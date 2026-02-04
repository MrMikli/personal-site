import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { z } from 'zod';

const sessionOptions = {
  password: process.env.IRON_SESSION_PASSWORD,
  cookieName: 'miklis_session',
  cookieOptions: { secure: process.env.NODE_ENV === 'production' }
};

const ToggleSchema = z.object({
  username: z.string().min(1),
  isAdmin: z.boolean()
});

export async function POST(request) {
  const session = await getIronSession(cookies(), sessionOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
  }

  const { username, isAdmin } = parsed.data;
  const updated = await prisma.user.update({
    where: { username },
    data: { isAdmin },
    select: { id: true, username: true, isAdmin: true }
  }).catch(() => null);

  if (!updated) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ user: updated });
}
