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

  const heatId = params?.heatId;
  const rollId = params?.rollId;
  if (!heatId || !rollId) {
    return NextResponse.json({ message: "Missing heatId or rollId" }, { status: 400 });
  }

  const guard = await ensureHeatIsMutable(heatId, { userId: session.user.id });
  if (!guard.ok) {
    return NextResponse.json({ message: guard.message }, { status: guard.status });
  }

  const userId = session.user.id;

  const roll = await prisma.heatRoll.findUnique({
    where: { id: rollId },
    include: {
      heatSignup: {
        select: {
          id: true,
          userId: true,
          heatId: true,
          heat: {
            select: {
              id: true,
              gauntletId: true,
              gauntlet: { select: { effectsEnabled: true } }
            }
          }
        }
      },
      wheel: true
    }
  });

  if (!roll) {
    return NextResponse.json({ message: "Roll not found" }, { status: 404 });
  }

  if (!roll.heatSignup || roll.heatSignup.heatId !== heatId) {
    return NextResponse.json({ message: "Roll does not belong to this heat" }, { status: 400 });
  }

  if (roll.heatSignup.userId !== userId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const gauntletId = roll.heatSignup.heat?.gauntletId;
  if (!gauntletId) {
    return NextResponse.json({ message: "Missing gauntletId" }, { status: 500 });
  }

  const effectsEnabled = roll.heatSignup.heat?.gauntlet?.effectsEnabled !== false;
  if (!effectsEnabled) {
    return NextResponse.json({ message: "Effects are disabled for this gauntlet" }, { status: 409 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const consumed = await tx.gauntletEffect.updateMany({
        where: {
          gauntletId,
          userId,
          kind: "REWARD_VETO_REROLL",
          remainingUses: { gt: 0 }
        },
        data: { remainingUses: { decrement: 1 } }
      });
      if (!consumed?.count) {
        throw new Error("No veto-reroll powerups remaining");
      }

      // Match technical veto behavior: remove the roll from the pool.
      await tx.heatRoll.delete({ where: { id: roll.id } });

      // If this was a bonus roll, refund its consumed token so the user can roll a
      // replacement bonus (same platform) after veto.
      if (roll.source === "BONUS" && roll.bonusHeatEffectId) {
        await tx.heatEffect.updateMany({
          where: {
            id: roll.bonusHeatEffectId,
            heatId,
            userId,
            kind: "REWARD_BONUS_ROLL_PLATFORM"
          },
          data: {
            remainingUses: 1,
            consumedAt: null
          }
        });
      }

      const inv = await tx.gauntletEffect.findUnique({
        where: {
          gauntletId_userId_kind: {
            gauntletId,
            userId,
            kind: "REWARD_VETO_REROLL"
          }
        },
        select: { remainingUses: true }
      });

      return {
        remainingVetos: Number(inv?.remainingUses) || 0
      };
    });

    return NextResponse.json({
      success: true,
      deletedRollId: rollId,
      remainingVetos: result.remainingVetos
    });
  } catch (e) {
    const msg = String(e?.message || e);
    const status = msg.includes("remaining") ? 400 : 500;
    return NextResponse.json({ message: msg }, { status });
  }
}
