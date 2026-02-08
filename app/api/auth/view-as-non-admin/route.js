import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const session = await getIronSession(cookies(), sessionOptions);

  // Only real admins can use this toggle. We intentionally check the *stored* admin flag
  // so the toggle still works even when an admin is currently masked.
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const enabled = !!body.enabled;

  session.viewAsNonAdmin = enabled;
  await session.save();

  return NextResponse.json({ viewAsNonAdmin: !!session.viewAsNonAdmin });
}
