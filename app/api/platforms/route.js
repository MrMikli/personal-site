import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Platforms that have at least one game.
  const platforms = await prisma.platform.findMany({
    where: { games: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, abbreviation: true }
  });

  return NextResponse.json({ platforms });
}
