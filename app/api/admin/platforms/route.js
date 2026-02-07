import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req) {
    const session = await getSession();
    if (!session?.user?.isAdmin) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const hasGamesParam = url.searchParams.get("hasGames");
    const onlyWithGames = hasGamesParam === "true" || hasGamesParam === "1";

    const platforms = await prisma.platform.findMany({
        where: onlyWithGames ? { games: { some: {} } } : undefined,
        orderBy: { name: "asc" },
        select: { id: true, name: true, abbreviation: true }
    });

    return NextResponse.json({ platforms });
}
