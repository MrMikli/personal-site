import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

function clampPoolMinus2Delta(basePool) {
  const base = Number(basePool);
  if (!Number.isFinite(base) || base <= 0) return 0;
  // Apply up to -2, but never below 1.
  return -Math.min(2, Math.max(0, base - 1));
}

function sumPoolDeltaWithPunishClamp(effects, basePool) {
  const rows = effects || [];
  let other = 0;
  let punish = 0;
  for (const e of rows) {
    const d = Number(e?.poolDelta) || 0;
    if (!d) continue;
    if (e?.kind === "PUNISH_ROLL_POOL_MINUS_30") punish += d;
    else other += d;
  }
  punish = Math.min(0, punish);
  const maxPunish = clampPoolMinus2Delta(basePool);
  const punishClamped = Math.max(punish, maxPunish);
  return other + punishClamped;
}

async function getHeatPoolState({ heatId, userId, basePool, gauntletId, heatOrder }) {
  const effects = await prisma.heatEffect.findMany({
    where: {
      heatId,
      userId,
      OR: [
        { poolDelta: { not: null } },
        { kind: "REWARD_BONUS_ROLL_PLATFORM" }
      ]
    },
    select: {
      kind: true,
      poolDelta: true,
      remainingUses: true,
      consumedAt: true
    }
  });

  let poolDelta = sumPoolDeltaWithPunishClamp(effects, basePool);

  const hasStoredPunishEffect = (effects || []).some(
    (e) => e?.kind === "PUNISH_ROLL_POOL_MINUS_30" && (Number(e?.poolDelta) || 0) < 0
  );
  if (!hasStoredPunishEffect && gauntletId && typeof heatOrder === "number") {
    const prevHeat = await prisma.heat.findFirst({
      where: { gauntletId, order: { lt: heatOrder } },
      orderBy: { order: "desc" },
      select: { id: true }
    });
    if (prevHeat?.id) {
      const prevSignup = await prisma.heatSignup.findUnique({
        where: { heatId_userId: { heatId: prevHeat.id, userId } },
        select: { status: true }
      });
      if (prevSignup?.status === "GIVEN_UP") {
        poolDelta += clampPoolMinus2Delta(basePool);
      }
    }
  }

  const configuredPool = Math.max(1, Number(basePool) + poolDelta);

  const bonusRolls = effects.filter(
    (e) =>
      e.kind === "REWARD_BONUS_ROLL_PLATFORM" &&
      !e.consumedAt &&
      (Number(e.remainingUses) || 0) > 0
  ).length;

  return {
    basePool: Number(basePool),
    poolDelta,
    configuredPool,
    bonusRolls,
    totalPool: configuredPool + bonusRolls
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

  const body = await request.json().catch(() => ({}));
  const { kind, platformId } = body || {};

  const ALLOWED_KINDS = ["REWARD_ROLL_POOL_PLUS_30", "REWARD_BONUS_ROLL_PLATFORM"];
  if (!ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ message: "Invalid effect kind" }, { status: 400 });
  }

  const userId = session.user.id;

  const heat = await prisma.heat.findUnique({
    where: { id: heatId },
    select: {
      id: true,
      gauntletId: true,
      order: true,
      defaultGameCounter: true,
      gauntlet: { select: { effectsEnabled: true } }
    }
  });
  if (!heat) {
    return NextResponse.json({ message: "Heat not found" }, { status: 404 });
  }

  if (heat.gauntlet?.effectsEnabled === false) {
    return NextResponse.json({ message: "Effects are disabled for this gauntlet" }, { status: 409 });
  }

  const inventory = await prisma.gauntletEffect.findUnique({
    where: {
      gauntletId_userId_kind: {
        gauntletId: heat.gauntletId,
        userId,
        kind
      }
    },
    select: { id: true, remainingUses: true }
  });

  if (!inventory || (Number(inventory.remainingUses) || 0) <= 0) {
    return NextResponse.json({ message: "You do not have this powerup available" }, { status: 400 });
  }

  // Powerup #1 changes the configured pool: must be activated before rolling.
  if (kind === "REWARD_ROLL_POOL_PLUS_30") {
    const signup = await prisma.heatSignup.findUnique({
      where: { heatId_userId: { heatId, userId } },
      select: { id: true }
    });

    if (signup) {
      const rollCount = await prisma.heatRoll.count({ where: { heatSignupId: signup.id } });
      if (rollCount > 0) {
        return NextResponse.json(
          { message: "You must activate this powerup before rolling" },
          { status: 409 }
        );
      }
    }

    const delta = 3;

    await prisma.$transaction([
      prisma.gauntletEffect.update({
        where: { id: inventory.id },
        data: { remainingUses: { decrement: 1 } }
      }),
      prisma.heatEffect.create({
        data: {
          heatId,
          userId,
          kind,
          poolDelta: delta,
          remainingUses: 1
        }
      })
    ]);

    const pool = await getHeatPoolState({
      heatId,
      userId,
      basePool: heat.defaultGameCounter,
      gauntletId: heat.gauntletId,
      heatOrder: heat.order
    });

    return NextResponse.json({ success: true, pool });
  }

  // Powerup #2 reserves a bonus roll for this heat on the chosen platform.
  if (kind === "REWARD_BONUS_ROLL_PLATFORM") {
    if (!platformId || typeof platformId !== "string") {
      return NextResponse.json({ message: "Missing platformId" }, { status: 400 });
    }

    const platform = await prisma.platform.findUnique({
      where: { id: platformId },
      select: { id: true }
    });
    if (!platform) {
      return NextResponse.json({ message: "Platform not found" }, { status: 404 });
    }

    // Ensure the platform has at least one game.
    const hasGame = await prisma.game.findFirst({
      where: { platforms: { some: { id: platformId } } },
      select: { id: true }
    });
    if (!hasGame) {
      return NextResponse.json({ message: "That platform has no games available" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.gauntletEffect.update({
        where: { id: inventory.id },
        data: { remainingUses: { decrement: 1 } }
      }),
      prisma.heatEffect.create({
        data: {
          heatId,
          userId,
          kind,
          platformId,
          remainingUses: 1
        }
      })
    ]);

    const pool = await getHeatPoolState({
      heatId,
      userId,
      basePool: heat.defaultGameCounter,
      gauntletId: heat.gauntletId,
      heatOrder: heat.order
    });

    return NextResponse.json({ success: true, pool });
  }

  return NextResponse.json({ message: "Not implemented" }, { status: 500 });
}
