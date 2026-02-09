import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { z } from "zod";

const ParamsSchema = z.object({
  userId: z.string().min(1)
});

export async function DELETE(_request, context) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = ParamsSchema.safeParse(context?.params ?? {});
  if (!parsedParams.success) {
    return NextResponse.json({ message: "Invalid user id" }, { status: 400 });
  }

  const { userId } = parsedParams.data;

  if (session?.user?.id && session.user.id === userId) {
    return NextResponse.json(
      { message: "You cannot delete the currently logged-in user." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true }
  });

  if (!user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.heatRoll.deleteMany({
      where: {
        heatSignup: {
          userId
        }
      }
    });

    await tx.heatSignup.deleteMany({
      where: {
        userId
      }
    });

    // Disconnect implicit M:N (gauntlet signups) to avoid join-table FK issues.
    await tx.user.update({
      where: { id: userId },
      data: { gauntlets: { set: [] } },
      select: { id: true }
    });

    await tx.user.delete({ where: { id: userId } });
  });

  return NextResponse.json({ ok: true, deletedUser: user });
}
