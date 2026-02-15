import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["UNBEATEN", "BEATEN", "GIVEN_UP"];
const TERMINAL_STATUSES = ["BEATEN", "GIVEN_UP"];

function clampPoolMinus2(basePool) {
  const base = Number(basePool);
  if (!Number.isFinite(base) || base <= 0) return 0;
  // Apply up to -2, but never below 1.
  return -Math.min(2, Math.max(0, base - 1));
}

async function awardRewardPowerup({ gauntletId, userId }) {
  // 1..4 inclusive
  const roll = Math.floor(Math.random() * 4) + 1;

  let kind;
  let uses;
  let label;

  if (roll === 1) {
    kind = "REWARD_ROLL_POOL_PLUS_30";
    uses = 1;
    label = "#1 (Roll pool +3 for one heat)";
  } else if (roll === 2) {
    kind = "REWARD_BONUS_ROLL_PLATFORM";
    uses = 1;
    label = "#2 (Bonus roll on any platform)";
  } else if (roll === 3) {
    kind = "REWARD_MOVE_WHEEL";
    uses = 4;
    label = "#3 (Move wheel 1–2 slots; 4 uses)";
  } else {
    kind = "REWARD_VETO_REROLL";
    uses = 2;
    label = "#4 (Veto reroll; 2 uses)";
  }

  const row = await prisma.gauntletEffect.upsert({
    where: {
      gauntletId_userId_kind: {
        gauntletId,
        userId,
        kind
      }
    },
    create: {
      gauntletId,
      userId,
      kind,
      remainingUses: uses
    },
    update: {
      remainingUses: { increment: uses }
    }
  });

  return {
    powerupNumber: roll,
    kind,
    addedUses: uses,
    totalUses: row.remainingUses,
    label
  };
}

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

  const heatRow = await prisma.heat.findUnique({
    where: { id: heatId },
    select: {
      gauntletId: true,
      order: true,
      defaultGameCounter: true,
      gauntlet: { select: { effectsEnabled: true } }
    }
  });
  const effectsEnabled = heatRow?.gauntlet?.effectsEnabled !== false;

  const body = await request.json().catch(() => ({}));
  const { status } = body || {};

  if (!ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  const userId = session.user.id;

  // Keep gauntlet membership in sync with any participation.
  try {
    if (heatRow?.gauntletId) {
      await prisma.gauntlet.update({
        where: { id: heatRow.gauntletId },
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

  const prevStatus = signup?.status || null;
  const isTransition = !signup || prevStatus !== status;

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

  // If we just transitioned into a terminal status, award the reward/punishment.
  // We intentionally do this AFTER persisting status so repeated calls don't re-award.
  let reward = null;
  let punishment = null;

  if (isTransition && status === "BEATEN") {
    if (!effectsEnabled) {
      reward = null;
    } else {
    try {
      if (heatRow?.gauntletId) {
        reward = await awardRewardPowerup({ gauntletId: heatRow.gauntletId, userId });
      }
    } catch (_e) {
      // ignore reward errors (status update already succeeded)
    }
    }
  }

  if (isTransition && status === "GIVEN_UP") {
    if (!effectsEnabled) {
      punishment = null;
    } else {
    try {
      if (heatRow?.gauntletId && typeof heatRow.order === "number") {
        const nextHeat = await prisma.heat.findFirst({
          where: {
            gauntletId: heatRow.gauntletId,
            order: { gt: heatRow.order }
          },
          orderBy: { order: "asc" },
          select: { id: true, order: true, name: true, defaultGameCounter: true }
        });

        // Last heat: discard punishment.
        if (nextHeat) {
          const base = nextHeat.defaultGameCounter;
          // If base pool is 1, punishment is unavailable (skip).
          if (Number(base) > 1) {
            const delta = clampPoolMinus2(base);
            const nextRollPool = Math.max(1, Number(base) + delta);

            await prisma.heatEffect.create({
              data: {
                heatId: nextHeat.id,
                userId,
                kind: "PUNISH_ROLL_POOL_MINUS_30",
                poolDelta: delta,
                remainingUses: 1
              }
            });

            punishment = {
              kind: "PUNISH_ROLL_POOL_MINUS_30",
              poolDelta: delta,
              nextHeat: {
                id: nextHeat.id,
                order: nextHeat.order,
                name: nextHeat.name || null
              },
              nextRollPool
            };
          } else {
            punishment = {
              kind: "PUNISH_ROLL_POOL_MINUS_30",
              poolDelta: 0,
              nextHeat: {
                id: nextHeat.id,
                order: nextHeat.order,
                name: nextHeat.name || null
              },
              nextRollPool: base
            };
          }
        }
      }
    } catch (_e) {
      // ignore punishment errors
    }
    }
  }

  return NextResponse.json({ success: true, status: signup.status, reward, punishment });
}
