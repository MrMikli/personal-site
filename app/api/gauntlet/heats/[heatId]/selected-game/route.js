import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ensureHeatIsMutable } from "@/lib/heatGuards";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { heatId } = params;

    const guard = await ensureHeatIsMutable(heatId, { userId: session.user.id });
    if (!guard.ok) {
      return NextResponse.json({ message: guard.message }, { status: guard.status });
    }
    const body = await request.json().catch(() => ({}));
    const { rollId } = body || {};

    if (!rollId) {
      return NextResponse.json(
        { message: "Missing rollId" },
        { status: 400 }
      );
    }

    const roll = await prisma.heatRoll.findUnique({
      where: { id: rollId },
      include: {
        heatSignup: true,
        game: true
      }
    });

    if (!roll) {
      return NextResponse.json({ message: "Roll not found" }, { status: 404 });
    }

    if (!roll.heatSignup) {
      return NextResponse.json(
        { message: "Roll is not linked to a signup" },
        { status: 400 }
      );
    }

    if (String(roll.heatSignup.heatId) !== String(heatId)) {
      return NextResponse.json(
        { message: "Roll does not belong to this heat" },
        { status: 403 }
      );
    }

    if (String(roll.heatSignup.userId) !== String(session.user.id)) {
      return NextResponse.json(
        { message: "You cannot choose a game for another user" },
        { status: 403 }
      );
    }

    const updatedSignup = await prisma.heatSignup.update({
      where: { id: roll.heatSignup.id },
      data: {
        selectedGameId: roll.gameId
      },
      select: {
        id: true,
        selectedGameId: true
      }
    });

    return NextResponse.json({
      success: true,
      selectedGameId: updatedSignup.selectedGameId
    });
  } catch (error) {
    console.error("Error choosing selected game for heat", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request, { params }) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { heatId } = params;

    const guard = await ensureHeatIsMutable(heatId, { userId: session.user.id });
    if (!guard.ok) {
      return NextResponse.json({ message: guard.message }, { status: guard.status });
    }

    const userId = session.user.id;

    const signup = await prisma.heatSignup.findUnique({
      where: {
        heatId_userId: { heatId, userId }
      }
    });

    if (!signup || !signup.selectedGameId) {
      return NextResponse.json(
        { message: "No picked game to undo for this heat" },
        { status: 400 }
      );
    }

    await prisma.heatSignup.update({
      where: { id: signup.id },
      data: { selectedGameId: null }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error undoing selected game for heat", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
