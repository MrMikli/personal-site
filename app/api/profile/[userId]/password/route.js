import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import bcrypt from "bcryptjs";
import { z } from "zod";

const ChangePasswordSchema = z
  .object({
    password: z.string().min(8).max(72),
    confirmPassword: z.string().min(8).max(72)
  })
  .superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match",
        path: ["confirmPassword"]
      });
    }
  });

async function resolveUserByParam(userIdParam) {
  if (!userIdParam) return null;

  const byId = await prisma.user.findUnique({
    where: { id: userIdParam },
    select: { id: true, username: true, isAdmin: true }
  });
  if (byId) return byId;

  const byUsername = await prisma.user.findUnique({
    where: { username: userIdParam },
    select: { id: true, username: true, isAdmin: true }
  });
  return byUsername;
}

export async function POST(request, { params }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userIdParam = params?.userId;
  const targetUser = await resolveUserByParam(userIdParam);
  if (!targetUser) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  const canEdit = session.user.id === targetUser.id || !!session.user.isAdmin;
  if (!canEdit) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid input" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.user.update({
    where: { id: targetUser.id },
    data: { passwordHash },
    select: { id: true }
  });

  return NextResponse.json({ ok: true });
}
