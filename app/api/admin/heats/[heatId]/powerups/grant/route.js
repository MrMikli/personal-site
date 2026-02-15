import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const ALLOWED_KINDS = [
  "REWARD_ROLL_POOL_PLUS_30",
  "REWARD_BONUS_ROLL_PLATFORM",
  "REWARD_MOVE_WHEEL",
  "REWARD_VETO_REROLL"
];

function getUsesForKind(kind) {
  if (kind === "REWARD_ROLL_POOL_PLUS_30") return 1;
  if (kind === "REWARD_BONUS_ROLL_PLATFORM") return 1;
  if (kind === "REWARD_MOVE_WHEEL") return 4;
  if (kind === "REWARD_VETO_REROLL") return 2;
  return 0;
}

export async function POST(request, { params }) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const heatId = params?.heatId;
  if (!heatId) {
    return NextResponse.json({ message: "Missing heatId" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const kind = body?.kind;
  if (!ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ message: "Invalid powerup kind" }, { status: 400 });
  }

  const addedUses = getUsesForKind(kind);
  if (!addedUses) {
    return NextResponse.json({ message: "Unsupported powerup kind" }, { status: 400 });
  }

  try {
    const heat = await prisma.heat.findUnique({
      where: { id: heatId },
      select: { gauntletId: true, gauntlet: { select: { effectsEnabled: true } } }
    });

    if (!heat?.gauntletId) {
      return NextResponse.json({ message: "Heat not found" }, { status: 404 });
    }

    if (heat.gauntlet?.effectsEnabled === false) {
      return NextResponse.json({ message: "Effects are disabled for this gauntlet" }, { status: 409 });
    }

    const row = await prisma.gauntletEffect.upsert({
      where: {
        gauntletId_userId_kind: {
          gauntletId: heat.gauntletId,
          userId: session.user.id,
          kind
        }
      },
      create: {
        gauntletId: heat.gauntletId,
        userId: session.user.id,
        kind,
        remainingUses: addedUses
      },
      update: {
        remainingUses: { increment: addedUses }
      }
    });

    return NextResponse.json({
      kind,
      addedUses,
      totalUses: row.remainingUses
    });
  } catch (e) {
    console.error("Failed to grant powerup", e);
    const isProd = process.env.NODE_ENV === "production";
    const errorMessage = e?.message ? String(e.message) : String(e);
    return NextResponse.json(
      {
        message: isProd ? "Failed to grant powerup" : `Failed to grant powerup: ${errorMessage}`
      },
      { status: 500 }
    );
  }
}
