import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const RegisterSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.string().email().optional().nullable(),
  password: z.string().min(8).max(72)
});

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, email, password } = RegisterSchema.parse(body);

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json({ message: 'Username already taken' }, { status: 400 });
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        return NextResponse.json({ message: 'Email already registered' }, { status: 400 });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({ data: { username, email: email ?? null, passwordHash } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
  }
}
