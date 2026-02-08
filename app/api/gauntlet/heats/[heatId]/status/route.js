import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["UNBEATEN", "BEATEN", "GIVEN_UP"];

export async function POST(request, { params }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const heatId = params?.heatId;
  if (!heatId) {
    return NextResponse.json({ message: "Missing heatId" }, { status: 400 });
  }

  const guard = await ensureHeatIsMutable(heatId, { userId: session.user.id });
  if (!guard.ok) {
    return NextResponse.json({ message: guard.message }, { status: guard.status });
  }

  const body = await request.json().catch(() => ({}));
  const { status } = body || {};

  if (!ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  const userId = session.user.id;

  let signup = await prisma.heatSignup.findUnique({
    where: {
      heatId_userId: { heatId, userId }
    }
  });

  if (!signup) {
    signup = await prisma.heatSignup.create({
      data: {
        heatId,
        userId,
        status
      }
    });
  } else if (signup.status !== status) {
    signup = await prisma.heatSignup.update({
      where: { id: signup.id },
      data: { status }
    });
  }

  return NextResponse.json({ success: true, status: signup.status });
}
