import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

const ALLOWED_DELTAS = new Set([-2, -1, 1, 2]);

export async function POST(request, { params }) {
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

  const body = await request.json().catch(() => ({}));
  const delta = Number(body?.delta);
  if (!Number.isInteger(delta) || !ALLOWED_DELTAS.has(delta)) {
    return NextResponse.json({ message: "Invalid delta" }, { status: 400 });
  }

  const cost = Math.abs(delta);

  const userId = session.user.id;

  const roll = await prisma.heatRoll.findUnique({
    where: { id: rollId },
    include: {
      heatSignup: {
        select: {
          id: true,
          userId: true,
          heatId: true,
          heat: { select: { gauntletId: true, gauntlet: { select: { effectsEnabled: true } } } }
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

  if (!roll.wheel) {
    return NextResponse.json({ message: "No wheel data stored for this roll" }, { status: 400 });
  }

  const gameIds = Array.isArray(roll.wheel.gameIds) ? roll.wheel.gameIds : null;
  const platformIds = Array.isArray(roll.wheel.platformIds) ? roll.wheel.platformIds : null;
  if (!gameIds || !platformIds || gameIds.length !== platformIds.length || gameIds.length === 0) {
    return NextResponse.json({ message: "Wheel data is invalid" }, { status: 500 });
  }

  if (gameIds.length <= 1) {
    return NextResponse.json({ message: "Wheel has no alternate slots" }, { status: 400 });
  }

  const currentIndex = Number(roll.wheel.chosenIndex) || 0;
  const rawNext = currentIndex + delta;
  const nextIndex = ((rawNext % gameIds.length) + gameIds.length) % gameIds.length;
  if (nextIndex === currentIndex) {
    return NextResponse.json({ message: "Move would not change selection" }, { status: 400 });
  }

  const nextGameId = gameIds[nextIndex];
  const nextPlatformId = platformIds[nextIndex];

  if (!nextGameId || typeof nextGameId !== "string") {
    return NextResponse.json({ message: "Invalid target game" }, { status: 500 });
  }

  // Prevent duplicates in the same signup.
  const dupe = await prisma.heatRoll.findFirst({
    where: {
      heatSignupId: roll.heatSignup.id,
      gameId: nextGameId,
      NOT: { id: roll.id }
    },
    select: { id: true }
  });
  if (dupe) {
    return NextResponse.json({ message: "That game is already in your pool" }, { status: 409 });
  }

  const gauntletId = roll.heatSignup.heat?.gauntletId;
  if (!gauntletId) {
    return NextResponse.json({ message: "Missing gauntletId" }, { status: 500 });
  }

  if (roll.heatSignup.heat?.gauntlet?.effectsEnabled === false) {
    return NextResponse.json({ message: "Effects are disabled for this gauntlet" }, { status: 409 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const consumed = await tx.gauntletEffect.updateMany({
        where: {
          gauntletId,
          userId,
          kind: "REWARD_MOVE_WHEEL",
          remainingUses: { gte: cost }
        },
        data: { remainingUses: { decrement: cost } }
      });

      if (!consumed?.count) {
        throw new Error("Not enough move-wheel powerups remaining");
      }

      const updatedRoll = await tx.heatRoll.update({
        where: { id: roll.id },
        data: {
          gameId: nextGameId,
          platformId: typeof nextPlatformId === "string" ? nextPlatformId : null
        },
        include: {
          game: {
            include: {
              platforms: { select: { id: true, name: true, abbreviation: true } }
            }
          },
          platform: { select: { id: true, name: true, abbreviation: true } }
        }
      });

      await tx.heatRollWheel.update({
        where: { heatRollId: roll.id },
        data: { chosenIndex: nextIndex }
      });

      const inventory = await tx.gauntletEffect.findUnique({
        where: {
          gauntletId_userId_kind: {
            gauntletId,
            userId,
            kind: "REWARD_MOVE_WHEEL"
          }
        },
        select: { remainingUses: true }
      });

      return {
        updatedRoll,
        remainingMoves: Number(inventory?.remainingUses) || 0
      };
    });

    return NextResponse.json({
      success: true,
      chosenIndex: nextIndex,
      roll: result.updatedRoll,
      remainingMoves: result.remainingMoves
    });
  } catch (e) {
    const msg = String(e?.message || e);
    const status = msg.includes("remaining") ? 400 : 500;
    return NextResponse.json({ message: msg }, { status });
  }
}
