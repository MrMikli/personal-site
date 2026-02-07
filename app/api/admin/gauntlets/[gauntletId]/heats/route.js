import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const gauntletId = params?.gauntletId;
  if (!gauntletId) {
    return NextResponse.json({ message: "Missing gauntletId" }, { status: 400 });
  }

  const heats = await prisma.heat.findMany({
    where: { gauntletId },
    orderBy: [{ order: "asc" }, { startsAt: "asc" }],
    select: {
      id: true,
      name: true,
      order: true,
      startsAt: true,
      endsAt: true,
      defaultGameCounter: true,
      platforms: { select: { id: true, name: true, abbreviation: true } }
    }
  });
  return NextResponse.json({ heats });
}

export async function POST(request, { params }) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const gauntletId = params?.gauntletId;
  if (!gauntletId) {
    return NextResponse.json({ message: "Missing gauntletId" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const orderNum = Number(body.order) || 1;
  if (!body.startsAt || !body.endsAt) {
    return NextResponse.json({ message: "startsAt and endsAt are required" }, { status: 400 });
  }
  const gameCount = Number(body.defaultGameCounter);
  if (!Number.isFinite(gameCount) || gameCount < 1) {
    return NextResponse.json({ message: "defaultGameCounter must be a positive integer" }, { status: 400 });
  }

  try {
    const created = await prisma.heat.create({
      data: {
        gauntlet: { connect: { id: gauntletId } },
        name: body.name || null,
        order: orderNum,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        defaultGameCounter: gameCount,
        platforms: body.platformIds && Array.isArray(body.platformIds)
          ? { connect: body.platformIds.map((id) => ({ id })) }
          : undefined
      },
      select: { id: true }
    });
    return NextResponse.json({ heat: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: "Failed to create heat" }, { status: 500 });
  }
}
