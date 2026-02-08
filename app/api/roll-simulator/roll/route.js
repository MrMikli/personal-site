import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const platformIds = Array.isArray(body.platformIds) ? body.platformIds : [];
  const onlyWestern = Boolean(body.onlyWestern);

  if (!platformIds.length) {
    return NextResponse.json(
      { message: "Select at least one platform" },
      { status: 400 }
    );
  }

  // Build a wheel where each slot is associated with one of the selected platforms.
  // This lets the UI show which platform the slot corresponds to.
  const remainingPlatformIds = [...platformIds];
  const eligibleByPlatform = {};
  for (const pid of remainingPlatformIds) {
    const ids = await prisma.game.findMany({
      where: {
        platforms: { some: { id: pid } },
        ...(onlyWestern
          ? {
              gamePlatforms: { some: { platformId: pid, hasWesternRelease: true } }
            }
          : {})
      },
      select: { id: true }
    });
    eligibleByPlatform[pid] = shuffleInPlace(ids.map((g) => g.id));
  }

  const union = new Set();
  for (const pid of remainingPlatformIds) {
    for (const id of eligibleByPlatform[pid] || []) union.add(id);
  }

  const totalGames = union.size;
  if (totalGames === 0) {
    return NextResponse.json(
      { message: "No eligible games available for the selected platforms" },
      { status: 400 }
    );
  }

  const take = Math.min(30, totalGames);
  const used = new Set();
  const slots = [];

  while (slots.length < take) {
    const pid = remainingPlatformIds[Math.floor(Math.random() * remainingPlatformIds.length)];
    const list = eligibleByPlatform[pid] || [];

    let gameId = null;
    while (list.length) {
      const candidate = list.pop();
      if (!candidate || used.has(candidate)) continue;
      gameId = candidate;
      break;
    }

    if (!gameId) {
      const idx = remainingPlatformIds.indexOf(pid);
      if (idx >= 0) remainingPlatformIds.splice(idx, 1);
      if (!remainingPlatformIds.length) break;
      continue;
    }

    used.add(gameId);
    slots.push({ gameId, platformId: pid });
  }

  if (!slots.length) {
    return NextResponse.json(
      { message: "No eligible games available for the selected platforms" },
      { status: 400 }
    );
  }

  const platformMeta = await prisma.platform.findMany({
    where: { id: { in: Array.from(new Set(slots.map((s) => s.platformId))) } },
    select: { id: true, name: true, abbreviation: true }
  });
  const platformById = new Map(platformMeta.map((p) => [p.id, p]));

  let wheelGames = await prisma.game.findMany({
    where: { id: { in: slots.map((s) => s.gameId) } },
    include: {
      platforms: { select: { id: true, name: true, abbreviation: true } }
    }
  });

  if (!wheelGames.length) {
    return NextResponse.json(
      { message: "No eligible games available for the selected platforms" },
      { status: 400 }
    );
  }

  // Preserve slot order
  const gameById = new Map(wheelGames.map((g) => [g.id, g]));
  wheelGames = slots.map((s) => gameById.get(s.gameId)).filter(Boolean);

  // Shuffle visuals, but keep platform alignment
  const shuffled = wheelGames.map((g, idx) => ({ g, platformId: slots[idx].platformId }));
  shuffleInPlace(shuffled);
  wheelGames = shuffled.map((x) => x.g);
  const slotPlatforms = shuffled.map((x) => {
    const p = platformById.get(x.platformId);
    return p ? { id: p.id, name: p.name, abbreviation: p.abbreviation } : null;
  });

  const chosenIndex = Math.floor(Math.random() * wheelGames.length);

  return NextResponse.json({
    wheel: {
      games: wheelGames,
      chosenIndex,
      slotPlatforms
    }
  });
}
