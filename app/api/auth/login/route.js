import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/session';

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid credentials' }, { status: 400 });
  }

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
  }

  const session = await getIronSession(cookies(), sessionOptions);
  session.user = { id: user.id, username: user.username, isAdmin: user.isAdmin };
  await session.save();

  return NextResponse.json({ ok: true });
}
