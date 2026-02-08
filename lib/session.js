import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export const sessionOptions = {
  password: process.env.IRON_SESSION_PASSWORD,
  cookieName: "miklis_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production"
  }
};

export async function getSession() {
  try {
    const session = await getIronSession(cookies(), sessionOptions);

    const viewAsNonAdmin = !!session.viewAsNonAdmin;
    if (session.user) {
      const isAdminActual = !!session.user.isAdmin;
      const isAdminMasked = isAdminActual && viewAsNonAdmin;

      session.user.isAdminActual = isAdminActual;
      session.user.isAdminMasked = isAdminMasked;
      session.user.isAdmin = isAdminActual && !viewAsNonAdmin;
    }

    return session;
  } catch {
    // Gracefully handle missing/invalid session secret during dev startup
    return { user: undefined };
  }
}
