import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

function clampYear(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const year = Math.floor(n);
  if (year < 1950 || year > 2100) return null;
  return year;
}

function shortYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return '';
  return String(Math.abs(Math.floor(y)) % 100).padStart(2, '0');
}

export async function POST(req) {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const basePlatformId = body?.basePlatformId;
  const yearStart = clampYear(body?.yearStart);
  const yearEnd = clampYear(body?.yearEnd);
  const explicitName = typeof body?.name === 'string' ? body.name.trim() : '';
  const explicitAbbreviation = typeof body?.abbreviation === 'string' ? body.abbreviation.trim() : '';

  if (!basePlatformId || typeof basePlatformId !== 'string') {
    return NextResponse.json({ message: 'basePlatformId is required' }, { status: 400 });
  }
  if (yearStart == null || yearEnd == null || yearStart > yearEnd) {
    return NextResponse.json({ message: 'Invalid yearStart/yearEnd' }, { status: 400 });
  }

  const base = await prisma.platform.findUnique({
    where: { id: basePlatformId },
    select: { id: true, name: true, abbreviation: true, igdbId: true }
  });
  if (!base) {
    return NextResponse.json({ message: 'Base platform not found' }, { status: 404 });
  }
  if (base.igdbId == null) {
    return NextResponse.json(
      { message: 'Base platform has no IGDB ID; choose a real IGDB-backed platform as the base.' },
      { status: 400 }
    );
  }

  const existing = await prisma.platform.findFirst({
    where: { parentPlatformId: base.id, yearStart, yearEnd },
    select: { id: true, name: true, yearStart: true, yearEnd: true }
  });
  if (existing) {
    return NextResponse.json({
      created: false,
      platform: existing
    });
  }

  const name = explicitName || `${base.name} (${yearStart}-${yearEnd})`;
  const autoAbbreviation = base.abbreviation
    ? `${base.abbreviation} ('${shortYear(yearStart)}-'${shortYear(yearEnd)})`
    : null;
  const abbreviation = explicitAbbreviation || autoAbbreviation;

  const created = await prisma.platform.create({
    data: {
      igdbId: null,
      name,
      abbreviation,
      parentPlatformId: base.id,
      yearStart,
      yearEnd
    },
    select: { id: true, name: true, igdbId: true, parentPlatformId: true, yearStart: true, yearEnd: true }
  });

  return NextResponse.json({ created: true, platform: created });
}
