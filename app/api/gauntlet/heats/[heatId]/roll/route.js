import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

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

  // Adjust totals to exactly defaultGameCounter while keeping each >= 1
  while (total !== defaultGameCounter) {
    for (let i = 0; i < scaled.length && total !== defaultGameCounter; i++) {
      if (total > defaultGameCounter && scaled[i] > 1) {
        scaled[i] -= 1;
        total -= 1;
      } else if (total < defaultGameCounter) {
        scaled[i] += 1;
        total += 1;
      }
    }
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

export async function POST(request, { params }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const heatId = params?.heatId;
  if (!heatId) {
    return NextResponse.json({ message: "Missing heatId" }, { status: 400 });
  }

  const guard = await ensureHeatIsMutable(heatId);
  if (!guard.ok) {
    return NextResponse.json({ message: guard.message }, { status: guard.status });
  }

  const body = await request.json().catch(() => ({}));
  const rawTargets = body.platformTargets || {};
  const rawWesternRequired = body.westernRequired;

  const heat = await prisma.heat.findUnique({
    where: { id: heatId },
    include: {
      platforms: { select: { id: true, name: true, abbreviation: true } }
    }
  });

  if (!heat) {
    return NextResponse.json({ message: "Heat not found" }, { status: 404 });
  }

  if (!heat.platforms.length) {
    return NextResponse.json({ message: "No platforms configured for this heat" }, { status: 400 });
  }

  // Find or create signup for this user
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
        userId
      }
    });
  }

  const existingRolls = await prisma.heatRoll.findMany({
    where: { heatSignupId: signup.id },
    select: {
      id: true,
      platformId: true,
      gameId: true,
      game: { select: { hasWesternRelease: true } }
    }
  });

  const totalExisting = existingRolls.length;
  if (totalExisting >= heat.defaultGameCounter) {
    return NextResponse.json({ message: "All rolls for this heat have been used" }, { status: 400 });
  }

  let targets = signup.platformTargets || null;
  let westernRequired = signup.westernRequired ?? 0;

  if (!targets) {
    if (!existingRolls.length) {
      // First roll: lock targets based on client configuration (normalized)
      targets = normalizeTargets(heat.platforms, heat.defaultGameCounter, rawTargets);

      let requestedWestern = Number(rawWesternRequired);
      if (!Number.isFinite(requestedWestern) || requestedWestern < 0) {
        requestedWestern = 0;
      }
      if (requestedWestern > heat.defaultGameCounter) {
        requestedWestern = heat.defaultGameCounter;
      }

      signup = await prisma.heatSignup.update({
        where: { id: signup.id },
        data: { platformTargets: targets, westernRequired: requestedWestern }
      });
      westernRequired = requestedWestern;
    } else {
      // Fallback for legacy data without targets but with existing rolls
      targets = normalizeTargets(heat.platforms, heat.defaultGameCounter, {});
    }
  }

  const existingCounts = existingRolls.reduce((acc, roll) => {
    if (!roll.platformId) return acc;
    const key = roll.platformId;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Western-release requirement tracking
  const existingWestern = existingRolls.reduce(
    (acc, roll) => (roll.game?.hasWesternRelease ? acc + 1 : acc),
    0
  );
  const rollsLeft = heat.defaultGameCounter - totalExisting;
  const neededWestern = Math.max(0, westernRequired - existingWestern);
  const mustBeWestern = neededWestern > 0 && neededWestern >= rollsLeft;

  const chosenPlatformId = pickPlatformIdByRemaining(targets, existingCounts);
  if (!chosenPlatformId) {
    return NextResponse.json({ message: "No remaining rolls available for configured platform targets" }, { status: 400 });
  }

  const existingGameIds = existingRolls.map((r) => r.gameId);

  const where = {
    platforms: { some: { id: chosenPlatformId } },
    ...(existingGameIds.length ? { id: { notIn: existingGameIds } } : {}),
    ...(mustBeWestern ? { hasWesternRelease: true } : {})
  };

  // Fetch all eligible game IDs for this platform (excluding already rolled),
  // then sample up to 30 uniformly at random for the wheel.
  const eligibleIds = await prisma.game.findMany({
    where,
    select: { id: true }
  });

  const totalGames = eligibleIds.length;
  if (totalGames === 0) {
    return NextResponse.json({ message: "No eligible games available for this platform" }, { status: 400 });
  }

  const take = Math.min(30, totalGames);
  const shuffledIds = shuffleInPlace([...eligibleIds]);
  const sampleIds = shuffledIds.slice(0, take).map((g) => g.id);

  let wheelGames = await prisma.game.findMany({
    where: { id: { in: sampleIds } },
    include: {
      platforms: { select: { id: true, name: true, abbreviation: true } }
    }
  });

  if (!wheelGames.length) {
    return NextResponse.json({ message: "No eligible games available for this platform" }, { status: 400 });
  }

  // Shuffle the wheel for visual randomness and pick the winner uniformly
  wheelGames = shuffleInPlace(wheelGames);
  const chosenIndex = Math.floor(Math.random() * wheelGames.length);
  const chosenGame = wheelGames[chosenIndex];

  const newOrder = totalExisting + 1;

  const createdRoll = await prisma.heatRoll.create({
    data: {
      heatSignupId: signup.id,
      gameId: chosenGame.id,
      platformId: chosenPlatformId,
      order: newOrder
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

  return NextResponse.json({
    roll: createdRoll,
    wheel: {
      games: wheelGames,
      chosenIndex
    },
    targets
  });
}
