import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

export async function POST(_request, { params }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const heatId = params?.heatId;
  if (!heatId) {
    return NextResponse.json({ message: "Missing heatId" }, { status: 400 });
  }

  const guard = await ensureHeatIsMutable(heatId, { userId: session.user.id });
  if (!guard.ok) {
    return NextResponse.json({ message: guard.message }, { status: guard.status });
  }

  const userId = session.user.id;

  const signup = await prisma.heatSignup.findUnique({
    where: {
      heatId_userId: { heatId, userId }
    }
  });

  if (!signup) {
    // Nothing to reset
    return NextResponse.json({ success: true });
  }

  await prisma.$transaction([
    prisma.heatRoll.deleteMany({ where: { heatSignupId: signup.id } }),
    prisma.heatSignup.update({
      where: { id: signup.id },
      data: {
        selectedGameId: null,
        platformTargets: null,
        status: "UNBEATEN"
      }
    })
  ]);

  return NextResponse.json({ success: true });
}
