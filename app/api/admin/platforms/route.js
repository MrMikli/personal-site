import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const platforms = await prisma.platform.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, abbreviation: true }
  });
  return NextResponse.json({ platforms });
}
