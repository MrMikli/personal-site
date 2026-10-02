// Roll pool arithmetic shared by the roll, status and activate routes, the heat guard
// and the heat page. A heat's pool is its defaultGameCounter plus any poolDelta effects,
// never below 1; unused bonus-roll tokens add rolls on top of that.
import { prisma } from "@/lib/prisma";

export const PUNISH_KIND = "PUNISH_ROLL_POOL_MINUS_30";
export const POOL_REWARD_KIND = "REWARD_ROLL_POOL_PLUS_30";
export const BONUS_ROLL_KIND = "REWARD_BONUS_ROLL_PLATFORM";

// REWARD_ROLL_POOL_PLUS_30 adds a flat +3 (the "30" in the name is historical).
export const POOL_REWARD_DELTA = 3;

// The give-up punishment: -2, but never taking the pool below 1. Returns 0 or a negative number.
export function punishmentDelta(basePool) {
  const base = Number(basePool);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return -Math.min(2, Math.max(0, base - 1)) || 0; // || 0 turns -0 into 0
}

// Sums poolDelta across heat effects. Punishments never stack beyond one punishmentDelta.
export function sumPoolDelta(effects, basePool) {
  let other = 0;
  let punish = 0;
  for (const e of effects || []) {
    const d = Number(e?.poolDelta) || 0;
    if (!d) continue;
    if (e?.kind === PUNISH_KIND) punish += d;
    else other += d;
  }
  const punishDelta = Math.max(Math.min(0, punish), punishmentDelta(basePool));
  return { poolDelta: other + punishDelta, punishDelta };
}

export function hasStoredPunishment(effects) {
  return (effects || []).some((e) => e?.kind === PUNISH_KIND && (Number(e?.poolDelta) || 0) < 0);
}

export function configuredPool(basePool, poolDelta) {
  return Math.max(1, Number(basePool) + poolDelta);
}

// Activated bonus-roll tokens that have not produced their roll yet.
export function isUnusedBonusRoll(effect) {
  return effect?.kind === BONUS_ROLL_KIND && !effect.consumedAt && (Number(effect.remainingUses) || 0) > 0;
}

// True when the user gave up the heat before this one. Used to apply the punishment
// "virtually" when the punishment row was never stored.
export async function gaveUpPreviousHeat({ gauntletId, heatOrder, userId }) {
  if (!gauntletId || typeof heatOrder !== "number") return false;
  const prevHeat = await prisma.heat.findFirst({
    where: { gauntletId, order: { lt: heatOrder } },
    orderBy: { order: "desc" },
    select: { id: true }
  });
  if (!prevHeat?.id) return false;
  const prevSignup = await prisma.heatSignup.findUnique({
    where: { heatId_userId: { heatId: prevHeat.id, userId } },
    select: { status: true }
  });
  return prevSignup?.status === "GIVEN_UP";
}
