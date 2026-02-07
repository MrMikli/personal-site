import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const gauntlets = await prisma.gauntlet.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });
  return NextResponse.json({ gauntlets });
}

export async function POST(request) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ message: "Name is required" }, { status: 400 });
  }
  const data = { name };

  try {
    const created = await prisma.gauntlet.create({ data, select: { id: true, name: true } });
    return NextResponse.json({ gauntlet: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: "Failed to create gauntlet" }, { status: 500 });
  }
}
