import { prisma } from "@/lib/prisma";

export async function ensureHeatIsMutable(heatId, options = {}) {
  const { userId } = options || {};
  if (!heatId) {
    return { ok: false, status: 400, message: "Missing heatId" };
  }

  const heat = await prisma.heat.findUnique({
    where: { id: heatId },
    select: { id: true, gauntletId: true, order: true, startsAt: true, endsAt: true }
  });

  if (!heat) {
    return { ok: false, status: 404, message: "Heat not found" };
  }

  const now = new Date();

  // Heat cannot be interacted with until the day before it starts.
  const start = heat.startsAt ? new Date(heat.startsAt) : null;
  if (start && !Number.isNaN(start.getTime())) {
    const startOfDay = new Date(start);
    startOfDay.setHours(0, 0, 0, 0);

    const openAt = new Date(startOfDay);
    openAt.setDate(openAt.getDate() - 1);

    if (now.getTime() < openAt.getTime()) {
      return {
        ok: false,
        status: 400,
        message: "This heat isn't open yet; you can interact starting the day before it starts."
      };
    }
  }

  // If there's a previous heat, user must have marked it as completed or given up.
  if (userId) {
    const prevHeat = await prisma.heat.findFirst({
      where: { gauntletId: heat.gauntletId, order: { lt: heat.order } },
      orderBy: { order: "desc" },
      select: { id: true }
    });

    if (prevHeat) {
      const prevSignup = await prisma.heatSignup.findUnique({
        where: { heatId_userId: { heatId: prevHeat.id, userId } },
        select: { status: true }
      });

      if (prevSignup?.status !== "BEATEN" && prevSignup?.status !== "GIVEN_UP") {
        return {
          ok: false,
          status: 400,
          message: "You must mark the previous heat as completed or given up before interacting with this heat."
        };
      }
    }
  }

  const end = heat.endsAt ? new Date(heat.endsAt) : null;
  if (end && !Number.isNaN(end.getTime())) {
    // Treat heat as closed after its end date (inclusive, end-of-day)
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);
    if (now.getTime() > endOfDay.getTime()) {
      return {
        ok: false,
        status: 400,
        message: "This heat is over; you can no longer change your selection or rolls."
      };
    }
  }

  return { ok: true };
}
