import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseDateOnly(value) {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

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
  if (body.startsAt !== undefined) {
    if (!body.startsAt) {
      return NextResponse.json({ message: "startsAt is required" }, { status: 400 });
    }
    const dt = parseDateOnly(body.startsAt);
    if (!dt) {
      return NextResponse.json({ message: "startsAt must be a valid date" }, { status: 400 });
    }
    data.startsAt = dt;
  }
  if (body.endsAt !== undefined) {
    if (!body.endsAt) {
      return NextResponse.json({ message: "endsAt is required" }, { status: 400 });
    }
    const dt = parseDateOnly(body.endsAt);
    if (!dt) {
      return NextResponse.json({ message: "endsAt must be a valid date" }, { status: 400 });
    }
    data.endsAt = dt;
  }
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
    const existing = await prisma.heat.findFirst({
      where: { id: heatId, gauntletId },
      select: { id: true }
    });
    if (!existing) {
      return NextResponse.json({ message: "Heat not found" }, { status: 404 });
    }

    await prisma.heat.update({
      where: { id: heatId },
      data
    });

    return NextResponse.json({ updated: 1 });
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
    const result = await prisma.$transaction(async (tx) => {
      const heat = await tx.heat.findFirst({
        where: { id: heatId, gauntletId },
        select: { id: true }
      });
      if (!heat) {
        return { notFound: true };
      }

      const signups = await tx.heatSignup.findMany({
        where: { heatId },
        select: { id: true }
      });
      const heatSignupIds = signups.map((s) => s.id);

      const rolls = heatSignupIds.length
        ? await tx.heatRoll.findMany({
            where: { heatSignupId: { in: heatSignupIds } },
            select: { id: true }
          })
        : [];
      const rollIds = rolls.map((r) => r.id);

      // Delete wheels first (FK -> HeatRoll)
      const deletedWheels = rollIds.length
        ? await tx.heatRollWheel.deleteMany({ where: { heatRollId: { in: rollIds } } })
        : { count: 0 };

      const deletedRolls = heatSignupIds.length
        ? await tx.heatRoll.deleteMany({ where: { heatSignupId: { in: heatSignupIds } } })
        : { count: 0 };

      const deletedHeatEffects = await tx.heatEffect.deleteMany({ where: { heatId } });

      const deletedSignups = await tx.heatSignup.deleteMany({ where: { heatId } });

      // Clear implicit M:N heat platforms (defensive; avoids join-table constraints)
      await tx.heat.update({
        where: { id: heatId },
        data: { platforms: { set: [] } },
        select: { id: true }
      });

      const deletedHeat = await tx.heat.delete({
        where: { id: heatId },
        select: { id: true }
      });

      return {
        notFound: false,
        heat: deletedHeat,
        deleted: {
          heatEffects: deletedHeatEffects.count,
          heatSignups: deletedSignups.count,
          heatRolls: deletedRolls.count,
          heatRollWheels: deletedWheels.count
        }
      };
    });

    if (result?.notFound) {
      return NextResponse.json({ message: "Heat not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("Failed to delete heat", e);
    const isProd = process.env.NODE_ENV === "production";
    const errorMessage = e?.message ? String(e.message) : String(e);
    return NextResponse.json(
      {
        message: isProd ? "Failed to delete heat" : `Failed to delete heat: ${errorMessage}`
      },
      { status: 500 }
    );
  }
}
