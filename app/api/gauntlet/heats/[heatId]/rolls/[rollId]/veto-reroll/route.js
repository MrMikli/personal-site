import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function sumPoolDelta(heatEffects) {
  return (heatEffects || []).reduce((acc, e) => acc + (Number(e.poolDelta) || 0), 0);
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

async function countWesternPairs(pairs) {
  if (!pairs.length) return 0;
  const rows = await prisma.gamePlatform.findMany({
    where: { OR: pairs },
    select: { gameId: true, platformId: true, hasWesternRelease: true }
  });
  const westernSet = new Set(
    rows
      .filter((r) => r.hasWesternRelease)
      .map((r) => `${r.gameId}:${r.platformId}`)
  );
  return pairs.reduce(
    (acc, p) => (westernSet.has(`${p.gameId}:${p.platformId}`) ? acc + 1 : acc),
    0
  );
}

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
          platformTargets: true,
          westernRequired: true,
          heat: {
            select: {
              id: true,
              gauntletId: true,
              defaultGameCounter: true
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

  const chosenPlatformId = roll.platformId;
  if (!chosenPlatformId) {
    return NextResponse.json({ message: "This roll has no platform; cannot reroll" }, { status: 400 });
  }

  // Load effects to preserve western requirement logic across configured+bonus pool.
  const heatEffects = await prisma.heatEffect.findMany({
    where: { heatId, userId },
    select: { kind: true, poolDelta: true, platformId: true, remainingUses: true, consumedAt: true }
  });
  const poolDelta = sumPoolDelta(heatEffects);
  const configuredPool = Math.max(1, Number(roll.heatSignup.heat?.defaultGameCounter || 0) + poolDelta);
  const bonusEffects = getBonusEffects(heatEffects);
  const totalAllowed = configuredPool + bonusEffects.length;

  // Existing rolls excluding the one being rerolled.
  const existingRolls = await prisma.heatRoll.findMany({
    where: { heatSignupId: roll.heatSignup.id },
    select: {
      id: true,
      platformId: true,
      gameId: true
    }
  });

  const otherRolls = existingRolls.filter((r) => r.id !== roll.id);
  const existingGameIds = otherRolls.map((r) => r.gameId);

  // Western requirement computation excluding this roll.
  const westernRequired = Number(roll.heatSignup.westernRequired) || 0;
  const pairs = otherRolls
    .filter((r) => r.gameId && r.platformId)
    .map((r) => ({ gameId: r.gameId, platformId: r.platformId }));
  const existingWestern = await countWesternPairs(pairs);
  const rollsLeft = totalAllowed - otherRolls.length;
  const neededWestern = Math.max(0, westernRequired - existingWestern);
  const mustBeWestern = neededWestern > 0 && neededWestern >= rollsLeft;

  // Eligible games for this platform, excluding duplicates.
  const ids = await prisma.game.findMany({
    where: {
      ...(existingGameIds.length ? { id: { notIn: existingGameIds } } : {}),
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
    return NextResponse.json({ message: "No eligible games available to reroll" }, { status: 400 });
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
    return NextResponse.json({ message: "No eligible games available to reroll" }, { status: 400 });
  }

  shuffleInPlace(wheelGames);
  const chosenIndex = Math.floor(Math.random() * wheelGames.length);
  const chosenGame = wheelGames[chosenIndex];

  const platform = await prisma.platform.findUnique({
    where: { id: chosenPlatformId },
    select: { id: true, name: true, abbreviation: true }
  });
  const slotPlatforms = wheelGames.map(() =>
    platform ? { id: platform.id, name: platform.name, abbreviation: platform.abbreviation } : null
  );

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

      const updatedRoll = await tx.heatRoll.update({
        where: { id: roll.id },
        data: {
          gameId: chosenGame.id,
          platformId: chosenPlatformId
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

      // Replace wheel contents.
      const wheelGameIds = wheelGames.map((g) => g.id);
      const wheelPlatformIds = slotPlatforms.map((p) => (p ? p.id : null));

      if (roll.wheel) {
        await tx.heatRollWheel.update({
          where: { heatRollId: roll.id },
          data: {
            chosenIndex,
            gameIds: wheelGameIds,
            platformIds: wheelPlatformIds
          }
        });
      } else {
        await tx.heatRollWheel.create({
          data: {
            heatRollId: roll.id,
            chosenIndex,
            gameIds: wheelGameIds,
            platformIds: wheelPlatformIds
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
        updatedRoll,
        remainingVetos: Number(inv?.remainingUses) || 0
      };
    });

    return NextResponse.json({
      success: true,
      roll: result.updatedRoll,
      wheel: { games: wheelGames, chosenIndex, slotPlatforms },
      remainingVetos: result.remainingVetos
    });
  } catch (e) {
    const msg = String(e?.message || e);
    const status = msg.includes("remaining") ? 400 : 500;
    return NextResponse.json({ message: msg }, { status });
  }
}
