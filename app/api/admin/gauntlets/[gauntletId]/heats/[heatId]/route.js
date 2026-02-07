import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const gauntletId = params?.gauntletId;
  const heatId = params?.heatId;
  if (!gauntletId || !heatId) {
    return NextResponse.json({ message: "Missing identifiers" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  const data = {};
  if (body.name !== undefined) data.name = body.name || null;
  if (body.order !== undefined) data.order = Number(body.order) || 1;
  if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (body.defaultGameCounter !== undefined) {
    const gameCount = Number(body.defaultGameCounter);
    if (!Number.isFinite(gameCount) || gameCount < 1) {
      return NextResponse.json({ message: "defaultGameCounter must be a positive integer" }, { status: 400 });
    }
    data.defaultGameCounter = gameCount;
  }
  if (Array.isArray(body.platformIds)) {
    data.platforms = { set: body.platformIds.map((id) => ({ id })) };
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "No fields to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.heat.updateMany({
      where: { id: heatId, gauntletId },
      data
    });
    if (updated.count === 0) {
      return NextResponse.json({ message: "Heat not found" }, { status: 404 });
    }
    return NextResponse.json({ updated: updated.count });
  } catch (e) {
    return NextResponse.json({ message: "Failed to update heat" }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const gauntletId = params?.gauntletId;
  const heatId = params?.heatId;
  if (!gauntletId || !heatId) {
    return NextResponse.json({ message: "Missing identifiers" }, { status: 400 });
  }

  try {
    const result = await prisma.heat.deleteMany({ where: { id: heatId, gauntletId } });
    if (result.count === 0) {
      return NextResponse.json({ message: "Heat not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: result.count });
  } catch (e) {
    return NextResponse.json({ message: "Failed to delete heat" }, { status: 500 });
  }
}
