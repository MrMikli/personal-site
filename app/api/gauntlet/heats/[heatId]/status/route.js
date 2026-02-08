import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["UNBEATEN", "BEATEN", "GIVEN_UP"];
const TERMINAL_STATUSES = ["BEATEN", "GIVEN_UP"];

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

  // Keep gauntlet membership in sync with any participation.
  try {
    const heat = await prisma.heat.findUnique({
      where: { id: heatId },
      select: { gauntletId: true }
    });
    if (heat?.gauntletId) {
      await prisma.gauntlet.update({
        where: { id: heat.gauntletId },
        data: { users: { connect: { id: userId } } }
      });
    }
  } catch (_e) {
    // ignore
  }

  let signup = await prisma.heatSignup.findUnique({
    where: {
      heatId_userId: { heatId, userId }
    }
  });

  // Once a user confirms they've beaten or given up, lock it in.
  // Admin reset-signup is the intended escape hatch.
  if (signup && TERMINAL_STATUSES.includes(signup.status) && signup.status !== status) {
    return NextResponse.json(
      { message: "Status is locked for this heat" },
      { status: 409 }
    );
  }

  // You can't meaningfully mark a heat as beaten/given up until you've picked a game.
  // Allow UNBEATEN (default) without a selected game.
  if (status !== "UNBEATEN") {
    const selectedGameId = signup?.selectedGameId ?? null;
    if (!selectedGameId) {
      return NextResponse.json({ message: "Pick a game before setting a status" }, { status: 400 });
    }
  }

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
