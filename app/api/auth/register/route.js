import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const RegisterSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(72)
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
    await prisma.user.create({ data: { username, passwordHash } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
  }
}
