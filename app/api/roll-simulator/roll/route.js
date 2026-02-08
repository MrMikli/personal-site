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

  const where = {
    platforms: { some: { id: { in: platformIds } } },
    ...(onlyWestern ? { hasWesternRelease: true } : {})
  };

  const eligibleIds = await prisma.game.findMany({
    where,
    select: { id: true }
  });

  const totalGames = eligibleIds.length;
  if (totalGames === 0) {
    return NextResponse.json(
      { message: "No eligible games available for the selected platforms" },
      { status: 400 }
    );
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
    return NextResponse.json(
      { message: "No eligible games available for the selected platforms" },
      { status: 400 }
    );
  }

  wheelGames = shuffleInPlace(wheelGames);
  const chosenIndex = Math.floor(Math.random() * wheelGames.length);

  return NextResponse.json({
    wheel: {
      games: wheelGames,
      chosenIndex
    }
  });
}
