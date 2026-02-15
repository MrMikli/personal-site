import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

function ceil30Pct(base) {
  const n = Number(base);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n * 0.3);
}

function normalizeTargets(heatPlatforms, defaultGameCounter, rawTargets) {
  if (!heatPlatforms.length || defaultGameCounter <= 0) {
    return {};
  }

  const baseValues = heatPlatforms.map((p) => {
    const raw = rawTargets && typeof rawTargets[p.id] !== "undefined" ? Number(rawTargets[p.id]) : 0;
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });

  let sum = baseValues.reduce((acc, v) => acc + v, 0);
  if (sum === 0) {
    // Fallback: 1 each, adjusted later
    for (let i = 0; i < baseValues.length; i++) baseValues[i] = 1;
    sum = baseValues.length;
  }

  let scaled = baseValues.slice();
  if (sum !== defaultGameCounter) {
    const scale = defaultGameCounter / sum;
    scaled = baseValues.map((v) => Math.max(1, Math.round(v * scale)));
  }

  let total = scaled.reduce((acc, v) => acc + v, 0);

  // If the requested total is smaller than the number of platforms, we can't keep each >= 1.
  // In that case, allocate 1 to the highest-weight platforms and 0 to the rest.
  if (defaultGameCounter < heatPlatforms.length) {
    const ranked = heatPlatforms
      .map((p, idx) => ({ platformId: p.id, idx, weight: baseValues[idx] }))
      .sort((a, b) => (b.weight - a.weight) || String(a.platformId).localeCompare(String(b.platformId)));
    const keep = new Set(ranked.slice(0, Math.max(0, defaultGameCounter)).map((r) => r.idx));
    scaled = scaled.map((_v, idx) => (keep.has(idx) ? 1 : 0));
    total = scaled.reduce((acc, v) => acc + v, 0);
  }

  // Adjust totals to exactly defaultGameCounter while keeping each >= 1
  while (total !== defaultGameCounter) {
    for (let i = 0; i < scaled.length && total !== defaultGameCounter; i++) {
      if (total > defaultGameCounter && scaled[i] > 1) {
        scaled[i] -= 1;
        total -= 1;
      } else if (total < defaultGameCounter) {
        // If defaultGameCounter < platform count we allow 0s; otherwise keep each >= 1
        if (defaultGameCounter < heatPlatforms.length) {
          scaled[i] += 1;
          total += 1;
        } else {
          scaled[i] += 1;
          total += 1;
        }
      }
    }

    // Safety valve to avoid infinite loops in weird configurations
    if (scaled.length === 0) break;
    if (total > defaultGameCounter && scaled.every((v) => v <= 1)) break;
  }

  const result = {};
  heatPlatforms.forEach((p, idx) => {
    result[p.id] = scaled[idx];
  });

  return result;
}

function pickPlatformIdByRemaining(targets, existingCounts) {
  const entries = Object.entries(targets);
  let totalRemaining = 0;
  const remaining = entries.map(([platformId, target]) => {
    const used = existingCounts[platformId] || 0;
    const rem = Math.max(0, target - used);
    totalRemaining += rem;
    return { platformId, remaining: rem };
  });

  if (totalRemaining <= 0) return null;

  let r = Math.floor(Math.random() * totalRemaining) + 1;
  for (const item of remaining) {
    if (item.remaining <= 0) continue;
    if (r <= item.remaining) {
      return item.platformId;
    }
    r -= item.remaining;
  }

  return null;
}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function clampPoolMinus2Delta(basePool) {
  const base = Number(basePool);
  if (!Number.isFinite(base) || base <= 0) return 0;
  // Apply up to -2, but never below 1.
  return -Math.min(2, Math.max(0, base - 1));
}

function sumPoolDelta(heatEffects, basePool) {
  const effects = heatEffects || [];
  let other = 0;
  let punish = 0;

  for (const e of effects) {
    const d = Number(e?.poolDelta) || 0;
    if (!d) continue;
    if (e?.kind === "PUNISH_ROLL_POOL_MINUS_30") punish += d;
    else other += d;
  }

  // Punishment is a one-time -2 (min pool 1). Never allow it to stack.
  punish = Math.min(0, punish);
  const maxPunish = clampPoolMinus2Delta(basePool);
  const punishClamped = Math.max(punish, maxPunish);

  return other + punishClamped;
}

function getBonusEffects(heatEffects) {
  return (heatEffects || []).filter(
    (e) =>
      e.kind === "REWARD_BONUS_ROLL_PLATFORM" &&
      !e.consumedAt &&
      (Number(e.remainingUses) || 0) > 0 &&
      typeof e.platformId === "string" &&
      e.platformId
  );
}

async function createRollWithWheel({
  prismaTx,
  signupId,
  gameId,
  platformId,
  order,
  source,
  bonusHeatEffectId,
  chosenIndex,
  wheelGames,
  slotPlatforms
}) {
  const createdRoll = await prismaTx.heatRoll.create({
    data: {
      heatSignupId: signupId,
      gameId,
      platformId,
      order,
      source,
      ...(bonusHeatEffectId ? { bonusHeatEffectId } : {})
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

  const wheelGameIds = (wheelGames || []).map((g) => g?.id).filter(Boolean);
  const wheelPlatformIds = (slotPlatforms || []).map((p) => (p ? p.id : null));

  await prismaTx.heatRollWheel.create({
    data: {
      heatRollId: createdRoll.id,
      chosenIndex: Number(chosenIndex) || 0,
      gameIds: wheelGameIds,
      platformIds: wheelPlatformIds
    }
  });

  return createdRoll;
}

export async function POST(request, { params }) {
  try {
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
    const rawTargets = body.platformTargets || {};
    const rawWesternRequired = body.westernRequired;

    const heat = await prisma.heat.findUnique({
      where: { id: heatId },
      include: {
        gauntlet: { select: { effectsEnabled: true } },
        platforms: { select: { id: true, name: true, abbreviation: true } }
      }
    });

    if (!heat) {
      return NextResponse.json({ message: "Heat not found" }, { status: 404 });
    }

    const effectsEnabled = heat.gauntlet?.effectsEnabled !== false;

    if (!heat.platforms.length) {
      return NextResponse.json({ message: "No platforms configured for this heat" }, { status: 400 });
    }

  // Find or create signup for this user
  const userId = session.user.id;

  // Ensure gauntlet membership is established (back-compat + consistency).
  try {
    await prisma.gauntlet.update({
      where: { id: heat.gauntletId },
      data: { users: { connect: { id: userId } } }
    });
  } catch (_e) {
    // ignore (already connected or gauntlet missing)
  }

  let signup = await prisma.heatSignup.findUnique({
    where: {
      heatId_userId: { heatId, userId }
    }
  });

  if (!signup) {
    signup = await prisma.heatSignup.create({
      data: {
        heatId,
        userId
      }
    });
  }

    const existingRolls = await prisma.heatRoll.findMany({
      where: { heatSignupId: signup.id },
      select: {
        id: true,
        order: true,
          source: true,
          bonusHeatEffectId: true,
        platformId: true,
        gameId: true,
        game: { select: { hasWesternRelease: true } }
      }
    });

    const heatEffects = effectsEnabled
      ? await prisma.heatEffect.findMany({
          where: { heatId, userId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            kind: true,
            poolDelta: true,
            platformId: true,
            remainingUses: true,
            consumedAt: true
          }
        })
      : [];

    const basePool = heat.defaultGameCounter;
    let virtualPunishDelta = 0;
    if (effectsEnabled && typeof heat?.order === "number") {
      const hasStoredPunishEffect = (heatEffects || []).some(
        (e) => e?.kind === "PUNISH_ROLL_POOL_MINUS_30" && (Number(e?.poolDelta) || 0) < 0
      );
      if (!hasStoredPunishEffect) {
        const prevHeat = await prisma.heat.findFirst({
          where: { gauntletId: heat.gauntletId, order: { lt: heat.order } },
          orderBy: { order: "desc" },
          select: { id: true }
        });

        if (prevHeat?.id) {
          const prevSignup = await prisma.heatSignup.findUnique({
            where: { heatId_userId: { heatId: prevHeat.id, userId } },
            select: { status: true }
          });
          if (prevSignup?.status === "GIVEN_UP") {
            virtualPunishDelta = clampPoolMinus2Delta(basePool);
          }
        }
      }
    }

    const poolDelta = effectsEnabled ? (sumPoolDelta(heatEffects, basePool) + virtualPunishDelta) : 0;
    const configuredPool = Math.max(1, Number(basePool) + poolDelta);

    // Bonus roll tokens increase the total allowed rolls by 1 each.
    // Importantly, once a bonus roll is consumed, the resulting BONUS roll still occupies a slot.
    // If a player later vetoes a NORMAL roll, they should be able to refill back up to the configured
    // pool while keeping the already-created BONUS roll.
    const bonusEffects = effectsEnabled ? getBonusEffects(heatEffects) : [];
    const existingBonusRollCount = existingRolls.filter((r) => r.source === "BONUS").length;
    const totalAllowed = configuredPool + existingBonusRollCount + bonusEffects.length;

    const totalExisting = existingRolls.length;
    if (totalExisting >= totalAllowed) {
      return NextResponse.json({ message: "All rolls for this heat have been used" }, { status: 400 });
    }

  let targets = signup.platformTargets || null;
  let westernRequired = signup.westernRequired ?? 0;

  if (!targets) {
    if (!existingRolls.length) {
      // First roll: lock targets based on client configuration (normalized)
      targets = normalizeTargets(heat.platforms, configuredPool, rawTargets);

      let requestedWestern = Number(rawWesternRequired);
      if (!Number.isFinite(requestedWestern) || requestedWestern < 0) {
        requestedWestern = 0;
      }
      if (requestedWestern > configuredPool) {
        requestedWestern = configuredPool;
      }

      signup = await prisma.heatSignup.update({
        where: { id: signup.id },
        data: { platformTargets: targets, westernRequired: requestedWestern }
      });
      westernRequired = requestedWestern;
    } else {
      // Fallback for legacy data without targets but with existing rolls
      targets = normalizeTargets(heat.platforms, configuredPool, {});
    }
  }

  const normalRolls = existingRolls.filter((r) => r.source === "NORMAL");
  const bonusRolls = existingRolls.filter((r) => r.source === "BONUS");

  const existingCounts = normalRolls.reduce((acc, roll) => {
    if (!roll.platformId) return acc;
    const key = roll.platformId;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Western-release requirement tracking (per rolled platform).
  // Game.hasWesternRelease can be true due to another platform; for guarantees we need
  // per-platform metadata when available.
  let existingWestern = 0;
  const westernPairs = existingRolls
    .filter((r) => r.gameId && r.platformId)
    .map((r) => ({ gameId: r.gameId, platformId: r.platformId }));

  if (westernPairs.length) {
    const rows = await prisma.gamePlatform.findMany({
      where: { OR: westernPairs },
      select: { gameId: true, platformId: true, hasWesternRelease: true }
    });
    const westernSet = new Set(
      rows
        .filter((r) => r.hasWesternRelease)
        .map((r) => `${r.gameId}:${r.platformId}`)
    );
    existingWestern = westernPairs.reduce(
      (acc, p) => (westernSet.has(`${p.gameId}:${p.platformId}`) ? acc + 1 : acc),
      0
    );
  } else {
    existingWestern = 0;
  }
  const rollsLeft = totalAllowed - totalExisting;
  const neededWestern = Math.max(0, westernRequired - existingWestern);
  const mustBeWestern = neededWestern > 0 && neededWestern >= rollsLeft;

  const existingGameIds = existingRolls.map((r) => r.gameId);

  const isBonusRoll = normalRolls.length >= configuredPool;

  // BONUS roll path (from activated powerup #2)
  if (isBonusRoll) {
    const effect = bonusEffects[0] || null;
    if (!effect?.id || !effect.platformId) {
      return NextResponse.json({ message: "No bonus rolls available" }, { status: 400 });
    }

    const chosenPlatformId = effect.platformId;

    const baseWhere = {
      ...(existingGameIds.length ? { id: { notIn: existingGameIds } } : {})
    };

    const ids = await prisma.game.findMany({
      where: {
        ...baseWhere,
        platforms: { some: { id: chosenPlatformId } },
        ...(mustBeWestern
          ? {
              gamePlatforms: {
                some: { platformId: chosenPlatformId, hasWesternRelease: true }
              }
            }
          : {})
      },
      select: { id: true }
    });

    const eligible = shuffleInPlace(ids.map((g) => g.id));
    if (!eligible.length) {
      return NextResponse.json({ message: "No eligible games available for this bonus platform" }, { status: 400 });
    }

    const take = Math.min(30, eligible.length);
    const wheelIds = eligible.slice(0, take);

    const games = await prisma.game.findMany({
      where: { id: { in: wheelIds } },
      include: {
        platforms: { select: { id: true, name: true, abbreviation: true } }
      }
    });

    const gameById = new Map(games.map((g) => [g.id, g]));
    let wheelGames = wheelIds.map((id) => gameById.get(id)).filter(Boolean);
    if (!wheelGames.length) {
      return NextResponse.json({ message: "No eligible games available for this bonus platform" }, { status: 400 });
    }

    // Shuffle visual order.
    shuffleInPlace(wheelGames);

    const platform = await prisma.platform.findUnique({
      where: { id: chosenPlatformId },
      select: { id: true, name: true, abbreviation: true }
    });

    const slotPlatforms = wheelGames.map(() =>
      platform ? { id: platform.id, name: platform.name, abbreviation: platform.abbreviation } : null
    );

    const chosenIndex = Math.floor(Math.random() * wheelGames.length);
    const chosenGame = wheelGames[chosenIndex];

    const maxExistingOrder = existingRolls.reduce(
      (acc, roll) => Math.max(acc, Number(roll.order) || 0),
      0
    );

    try {
      const createdRoll = await prisma.$transaction(async (tx) => {
        const updated = await tx.heatEffect.updateMany({
          where: { id: effect.id, remainingUses: { gt: 0 }, consumedAt: null },
          data: { remainingUses: { decrement: 1 }, consumedAt: new Date() }
        });
        if (!updated?.count) {
          throw new Error("Bonus roll was already used. Please try again.");
        }

        return createRollWithWheel({
          prismaTx: tx,
          signupId: signup.id,
          gameId: chosenGame.id,
          platformId: chosenPlatformId,
          order: maxExistingOrder + 1,
          source: "BONUS",
          bonusHeatEffectId: effect.id,
          chosenIndex,
          wheelGames,
          slotPlatforms
        });
      });

      return NextResponse.json({
        roll: createdRoll,
        wheel: {
          games: wheelGames,
          chosenIndex,
          slotPlatforms
        },
        targets
      });
    } catch (err) {
      return NextResponse.json(
        { message: err?.message ? String(err.message) : "Failed to create bonus roll" },
        { status: 400 }
      );
    }
  }

  // NORMAL roll path
  const chosenPlatformId = pickPlatformIdByRemaining(targets, existingCounts);
  if (!chosenPlatformId) {
    return NextResponse.json({ message: "No remaining rolls available for configured platform targets" }, { status: 400 });
  }

  // Build a mixed wheel across all platforms that still have remaining target counts,
  // but force the chosen game to come from the platform selected by remaining-quota logic.
  const remainingByPlatformId = Object.entries(targets).reduce((acc, [platformId, target]) => {
    const used = existingCounts[platformId] || 0;
    const rem = Math.max(0, Number(target) - used);
    if (rem > 0) acc[platformId] = rem;
    return acc;
  }, {});

  const platformIdsWithRemaining = Object.keys(remainingByPlatformId);
  if (!platformIdsWithRemaining.length) {
    return NextResponse.json({ message: "No remaining rolls available for configured platform targets" }, { status: 400 });
  }

  const baseWhere = {
    ...(existingGameIds.length ? { id: { notIn: existingGameIds } } : {})
  };

  const eligibleIdsByPlatformId = {};
  for (const platformId of platformIdsWithRemaining) {
    const ids = await prisma.game.findMany({
      where: {
        ...baseWhere,
        platforms: { some: { id: platformId } }
        ,
        ...(mustBeWestern
          ? {
              gamePlatforms: {
                some: { platformId, hasWesternRelease: true }
              }
            }
          : {})
      },
      select: { id: true }
    });
    eligibleIdsByPlatformId[platformId] = shuffleInPlace(ids.map((g) => g.id));
  }

  const eligibleChosen = eligibleIdsByPlatformId[chosenPlatformId] || [];
  if (!eligibleChosen.length) {
    return NextResponse.json({ message: "No eligible games available for this platform" }, { status: 400 });
  }

  // Determine a wheel size based on available unique game IDs across remaining platforms.
  const union = new Set();
  for (const pid of platformIdsWithRemaining) {
    for (const id of eligibleIdsByPlatformId[pid] || []) union.add(id);
  }
  const take = Math.min(30, union.size);
  if (take <= 0) {
    return NextResponse.json({ message: "No eligible games available for configured platform targets" }, { status: 400 });
  }

  const usedInWheel = new Set();
  const wheelSlots = [];

  // Ensure the wheel has a visible mix by seeding some slots from the chosen platform.
  const seedFromChosen = Math.min(Math.max(1, Math.ceil(take / 2)), eligibleChosen.length, take);
  while (wheelSlots.length < seedFromChosen && eligibleIdsByPlatformId[chosenPlatformId].length) {
    const gameId = eligibleIdsByPlatformId[chosenPlatformId].pop();
    if (!gameId || usedInWheel.has(gameId)) continue;
    usedInWheel.add(gameId);
    wheelSlots.push({ gameId, platformId: chosenPlatformId });
  }

  function pickPlatformForWheel() {
    const entries = platformIdsWithRemaining
      .map((pid) => ({ pid, remaining: remainingByPlatformId[pid] || 0 }))
      .filter((e) => e.remaining > 0 && (eligibleIdsByPlatformId[e.pid] || []).length > 0);

    if (!entries.length) return null;
    const total = entries.reduce((acc, e) => acc + e.remaining, 0);
    let r = Math.floor(Math.random() * total) + 1;
    for (const e of entries) {
      if (r <= e.remaining) return e.pid;
      r -= e.remaining;
    }
    return entries[0].pid;
  }

  while (wheelSlots.length < take) {
    const pid = pickPlatformForWheel();
    if (!pid) break;
    const list = eligibleIdsByPlatformId[pid] || [];
    let gameId = null;
    while (list.length) {
      const candidate = list.pop();
      if (!candidate || usedInWheel.has(candidate)) continue;
      gameId = candidate;
      break;
    }
    if (!gameId) {
      remainingByPlatformId[pid] = 0;
      continue;
    }
    usedInWheel.add(gameId);
    wheelSlots.push({ gameId, platformId: pid });
    remainingByPlatformId[pid] = Math.max(0, (remainingByPlatformId[pid] || 0) - 1);
  }

  // Fetch full game objects, then preserve wheel slot order.
  const wheelIds = wheelSlots.map((s) => s.gameId);
  const games = await prisma.game.findMany({
    where: { id: { in: wheelIds } },
    include: {
      platforms: { select: { id: true, name: true, abbreviation: true } }
    }
  });

  const gameById = new Map(games.map((g) => [g.id, g]));
  let wheelGames = wheelSlots.map((s) => gameById.get(s.gameId)).filter(Boolean);

  if (!wheelGames.length) {
    return NextResponse.json({ message: "No eligible games available for configured platform targets" }, { status: 400 });
  }

  // Shuffle visual order, but keep platform mapping aligned.
  const shuffled = wheelGames.map((g, idx) => ({ g, platformId: wheelSlots[idx].platformId }));
  shuffleInPlace(shuffled);
  wheelGames = shuffled.map((x) => x.g);

  const platformById = new Map((heat.platforms || []).map((p) => [p.id, p]));
  const slotPlatforms = shuffled.map((x) => {
    const p = platformById.get(x.platformId);
    return p ? { id: p.id, name: p.name, abbreviation: p.abbreviation } : null;
  });

  // Force the chosen index to land on a slot from chosenPlatformId.
  const chosenIndices = shuffled
    .map((x, idx) => (x.platformId === chosenPlatformId ? idx : -1))
    .filter((idx) => idx >= 0);
  const chosenIndex = chosenIndices.length
    ? chosenIndices[Math.floor(Math.random() * chosenIndices.length)]
    : Math.floor(Math.random() * wheelGames.length);

    const chosenGame = wheelGames[chosenIndex];

    // Order must be unique per signup. After technical veto deletes, roll count no longer
    // corresponds to the highest order, so use max(order)+1.
    const maxExistingOrder = existingRolls.reduce(
      (acc, roll) => Math.max(acc, Number(roll.order) || 0),
      0
    );

    let createdRoll;
    try {
      createdRoll = await prisma.$transaction(async (tx) => {
        try {
          return await createRollWithWheel({
            prismaTx: tx,
            signupId: signup.id,
            gameId: chosenGame.id,
            platformId: chosenPlatformId,
            order: maxExistingOrder + 1,
            source: "NORMAL",
            chosenIndex,
            wheelGames,
            slotPlatforms
          });
        } catch (err) {
          // Rare race: two rolls at once. Retry once with the latest max.
          if (err?.code === "P2002") {
            const latest = await tx.heatRoll.aggregate({
              where: { heatSignupId: signup.id },
              _max: { order: true }
            });
            const nextOrder = (latest?._max?.order || 0) + 1;
            return createRollWithWheel({
              prismaTx: tx,
              signupId: signup.id,
              gameId: chosenGame.id,
              platformId: chosenPlatformId,
              order: nextOrder,
              source: "NORMAL",
              chosenIndex,
              wheelGames,
              slotPlatforms
            });
          }
          throw err;
        }
      });
    } catch (err) {
      throw err;
    }

    return NextResponse.json({
      roll: createdRoll,
      wheel: {
        games: wheelGames,
        chosenIndex,
        slotPlatforms
      },
      targets
    });
  } catch (err) {
    console.error('Heat roll error', err);
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { message: 'Roll order conflict. Please try rolling again.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: err?.message ? String(err.message) : 'Internal server error' },
      { status: 500 }
    );
  }
}
