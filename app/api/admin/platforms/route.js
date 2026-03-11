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

export async function PATCH(req) {
    const session = await getSession();
    if (!session?.user?.isAdmin) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
    }

    const platformId = typeof body?.platformId === "string" ? body.platformId : null;
    const rollYearEndRaw = body?.rollYearEnd;

    if (!platformId) {
        return NextResponse.json({ message: "platformId is required" }, { status: 400 });
    }

    let rollYearEnd = null;
    if (rollYearEndRaw !== null && rollYearEndRaw !== undefined) {
        if (typeof rollYearEndRaw !== "number" || !Number.isInteger(rollYearEndRaw)) {
            return NextResponse.json({ message: "rollYearEnd must be an integer year or null" }, { status: 400 });
        }
        if (rollYearEndRaw < 1950 || rollYearEndRaw > 2100) {
            return NextResponse.json({ message: "rollYearEnd must be between 1950 and 2100" }, { status: 400 });
        }
        rollYearEnd = rollYearEndRaw;
    }

    const platform = await prisma.platform.update({
        where: { id: platformId },
        data: { rollYearEnd },
        select: { id: true, rollYearEnd: true }
    });

    return NextResponse.json({ platform });
}
