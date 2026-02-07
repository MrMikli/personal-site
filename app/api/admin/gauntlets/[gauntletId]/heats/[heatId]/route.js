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
