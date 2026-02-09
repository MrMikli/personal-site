import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/session';

const RegisterSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(72),
  confirmPassword: z.string().min(8).max(72)
}).superRefine((val, ctx) => {
  if (val.password !== val.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Passwords do not match',
      path: ['confirmPassword']
    });
  }
});

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, password } = RegisterSchema.parse(body);

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json({ message: 'Username already taken' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username, passwordHash },
      select: { id: true, username: true, isAdmin: true }
    });

    const session = await getIronSession(cookies(), sessionOptions);
    session.user = { id: user.id, username: user.username, isAdmin: user.isAdmin };
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
  }
}
