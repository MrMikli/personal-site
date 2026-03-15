import { prisma } from "@/lib/prisma";
import { getUtcDayBoundsMs } from "@/lib/dateOnly";

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

  // Enforce explicit gauntlet membership for current/upcoming gauntlets.
  // Previous gauntlets are effectively non-mutable anyway (blocked below), so this is
  // primarily for interaction endpoints.
  if (userId) {
    const isMember = await prisma.gauntlet.findFirst({
      where: {
        id: heat.gauntletId,
        users: { some: { id: userId } }
      },
      select: { id: true }
    });

    if (!isMember) {
      // Back-compat: if user already has any signup in this gauntlet, treat as joined.
      const legacySignup = await prisma.heatSignup.findFirst({
        where: {
          userId,
          heat: { gauntletId: heat.gauntletId }
        },
        select: { id: true }
      });

      if (!legacySignup) {
        return { ok: false, status: 403, message: "Join the gauntlet before interacting with its heats." };
      }
    }
  }

  const nowMs = Date.now();

  // Heat cannot be interacted with until the day before it starts.
  const startBounds = getUtcDayBoundsMs(heat.startsAt);
  if (startBounds) {
    const openAtMs = startBounds.start - 24 * 60 * 60 * 1000;
    if (nowMs < openAtMs) {
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
      select: { id: true, endsAt: true }
    });

    if (prevHeat) {
      const prevSignup = await prisma.heatSignup.findUnique({
        where: { heatId_userId: { heatId: prevHeat.id, userId } },
        select: { status: true }
      });

      if (prevSignup?.status !== "BEATEN" && prevSignup?.status !== "GIVEN_UP") {
        // Auto-timeout: once the previous heat has ended, treat lingering UNBEATEN (or no signup)
        // as a loss (GIVEN_UP) so the user can proceed.
        const prevEndBounds = getUtcDayBoundsMs(prevHeat.endsAt);
        const prevIsOver = prevEndBounds ? nowMs > prevEndBounds.end : false;

        if (prevIsOver) {
          try {
            await prisma.heatSignup.upsert({
              where: { heatId_userId: { heatId: prevHeat.id, userId } },
              create: {
                heatId: prevHeat.id,
                userId,
                status: "GIVEN_UP"
              },
              update: {
                status: "GIVEN_UP"
              }
            });
          } catch (_e) {
            // ignore (race/unique constraint) and fall through to allow.
          }
        } else {
          return {
            ok: false,
            status: 400,
            message: "You must mark the previous heat as completed or given up before interacting with this heat."
          };
        }
      }
    }
  }

  const endBounds = getUtcDayBoundsMs(heat.endsAt);
  if (endBounds && nowMs > endBounds.end) {
    return {
      ok: false,
      status: 400,
      message: "This heat is over; you can no longer change your selection or rolls."
    };
  }

  return { ok: true };
}
