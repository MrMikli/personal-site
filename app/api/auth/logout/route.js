import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

const sessionOptions = {
  password: process.env.IRON_SESSION_PASSWORD,
  cookieName: 'miklis_session',
  cookieOptions: { secure: process.env.NODE_ENV === 'production' }
};

export async function POST(request) {
  const session = await getIronSession(cookies(), sessionOptions);
  await session.destroy();
  // Redirect to home after logout
  const url = new URL('/', request.url);
  return NextResponse.redirect(url);
}
