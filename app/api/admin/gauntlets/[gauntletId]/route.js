import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(_request, { params }) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const gauntletId = params?.gauntletId;
  if (!gauntletId) {
    return NextResponse.json({ message: "Missing gauntletId" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const gauntlet = await tx.gauntlet.findUnique({
        where: { id: gauntletId },
        select: { id: true, name: true, heats: { select: { id: true } } }
      });

      if (!gauntlet) {
        return { notFound: true };
      }

      const heatIds = (gauntlet.heats || []).map((h) => h.id);

      const signups = heatIds.length
        ? await tx.heatSignup.findMany({
            where: { heatId: { in: heatIds } },
            select: { id: true }
          })
        : [];
      const heatSignupIds = signups.map((s) => s.id);

      // Delete wheels first (FK -> HeatRoll)
      const deletedWheels = heatSignupIds.length
        ? await tx.heatRollWheel.deleteMany({
            where: { heatRoll: { heatSignupId: { in: heatSignupIds } } }
          })
        : { count: 0 };

      const deletedRolls = heatSignupIds.length
        ? await tx.heatRoll.deleteMany({ where: { heatSignupId: { in: heatSignupIds } } })
        : { count: 0 };

      const deletedHeatEffects = heatIds.length
        ? await tx.heatEffect.deleteMany({ where: { heatId: { in: heatIds } } })
        : { count: 0 };

      const deletedGauntletEffects = await tx.gauntletEffect.deleteMany({ where: { gauntletId } });

      const deletedSignups = heatIds.length
        ? await tx.heatSignup.deleteMany({ where: { heatId: { in: heatIds } } })
        : { count: 0 };

      // Clear implicit M:N gauntlet signups (Gauntlet.users)
      await tx.gauntlet.update({
        where: { id: gauntletId },
        data: { users: { set: [] } },
        select: { id: true }
      });

      const deletedHeats = await tx.heat.deleteMany({ where: { gauntletId } });
      const deletedGauntlet = await tx.gauntlet.delete({
        where: { id: gauntletId },
        select: { id: true, name: true }
      });

      return {
        notFound: false,
        gauntlet: deletedGauntlet,
        deleted: {
          heats: deletedHeats.count,
          heatSignups: deletedSignups.count,
          heatRolls: deletedRolls.count,
          heatRollWheels: deletedWheels.count,
          heatEffects: deletedHeatEffects.count,
          gauntletEffects: deletedGauntletEffects.count
        }
      };
    });

    if (result?.notFound) {
      return NextResponse.json({ message: "Gauntlet not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("Failed to delete gauntlet", e);
    const isProd = process.env.NODE_ENV === "production";
    const errorMessage = e?.message ? String(e.message) : String(e);
    return NextResponse.json(
      {
        message: isProd ? "Failed to delete gauntlet" : `Failed to delete gauntlet: ${errorMessage}`
      },
      { status: 500 }
    );
  }
}
