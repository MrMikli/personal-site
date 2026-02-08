import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request, { params }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const gauntletId = params?.gauntletId;
  if (!gauntletId) {
    return NextResponse.json({ message: "Missing gauntletId" }, { status: 400 });
  }

  const userId = session.user.id;

  const gauntlet = await prisma.gauntlet.findUnique({
    where: { id: gauntletId },
    select: { id: true }
  });

  if (!gauntlet) {
    return NextResponse.json({ message: "Gauntlet not found" }, { status: 404 });
  }

  const alreadyJoined = await prisma.gauntlet.findFirst({
    where: {
      id: gauntletId,
      users: { some: { id: userId } }
    },
    select: { id: true }
  });

  if (!alreadyJoined) {
    await prisma.gauntlet.update({
      where: { id: gauntletId },
      data: {
        users: { connect: { id: userId } }
      }
    });
  }

  return NextResponse.json({ success: true, joined: true });
}
