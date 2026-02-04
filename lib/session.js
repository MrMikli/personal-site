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
    return session;
  } catch {
    // Gracefully handle missing/invalid session secret during dev startup
    return { user: undefined };
  }
}
