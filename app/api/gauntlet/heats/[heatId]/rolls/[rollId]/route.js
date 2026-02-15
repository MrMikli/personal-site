import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

export async function DELETE(_request, { params }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const heatId = params?.heatId;
  const rollId = params?.rollId;

  if (!heatId || !rollId) {
    return NextResponse.json({ message: "Missing heatId or rollId" }, { status: 400 });
  }

  const guard = await ensureHeatIsMutable(heatId, { userId: session.user.id });
  if (!guard.ok) {
    return NextResponse.json({ message: guard.message }, { status: guard.status });
  }

  const roll = await prisma.heatRoll.findUnique({
    where: { id: rollId },
    include: {
      heatSignup: true
    }
  });

  if (!roll) {
    return NextResponse.json({ message: "Roll not found" }, { status: 404 });
  }

  if (roll.heatSignup.heatId !== heatId) {
    return NextResponse.json({ message: "Roll does not belong to this heat" }, { status: 400 });
  }

  if (roll.heatSignup.userId !== session.user.id) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.heatRoll.delete({ where: { id: rollId } });

    // If the deleted roll was a consumed bonus roll, refund the bonus token so the
    // user can roll a replacement bonus on the same chosen platform.
    if (roll.source === "BONUS" && roll.bonusHeatEffectId) {
      await tx.heatEffect.updateMany({
        where: {
          id: roll.bonusHeatEffectId,
          heatId,
          userId: session.user.id,
          kind: "REWARD_BONUS_ROLL_PLATFORM"
        },
        data: {
          remainingUses: 1,
          consumedAt: null
        }
      });
    }
  });

  return NextResponse.json({ success: true });
}
