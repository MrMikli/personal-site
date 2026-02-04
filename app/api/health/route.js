import { NextResponse } from 'next/server';

// Keep /health open and always return 200 OK for external health checks
export async function GET() {
  return NextResponse.json({ ok: true });
}
