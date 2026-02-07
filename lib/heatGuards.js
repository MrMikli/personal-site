import { prisma } from "@/lib/prisma";

export async function ensureHeatIsMutable(heatId) {
  if (!heatId) {
    return { ok: false, status: 400, message: "Missing heatId" };
  }

  const heat = await prisma.heat.findUnique({
    where: { id: heatId },
    select: { id: true, endsAt: true }
  });

  if (!heat) {
    return { ok: false, status: 404, message: "Heat not found" };
  }

  const now = new Date();
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
