import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

const LoginSchema = z.object({
  identifier: z.string().min(1), // username or email
  password: z.string().min(1)
});

const sessionOptions = {
  password: process.env.IRON_SESSION_PASSWORD,
  cookieName: 'miklis_session',
  cookieOptions: { secure: process.env.NODE_ENV === 'production' }
};

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid credentials' }, { status: 400 });
  }

  const { identifier, password } = parsed.data;

  // Determine whether identifier is an email or a username
  const looksLikeEmail = /@/.test(identifier);
  const user = await prisma.user.findUnique({
    where: looksLikeEmail ? { email: identifier } : { username: identifier }
  });

  if (!user) {
    return NextResponse.json({ message: 'Invalid username/email or password' }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ message: 'Invalid username/email or password' }, { status: 401 });
  }

  const session = await getIronSession(cookies(), sessionOptions);
  session.user = { id: user.id, username: user.username, email: user.email || null, isAdmin: user.isAdmin };
  await session.save();

  return NextResponse.json({ ok: true });
}
