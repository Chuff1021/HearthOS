import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { addLocationPoint, getLatestLocationsByTech, getLocationHistory, getMileageSummary } from '@/lib/tech-location-store';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const techId = searchParams.get('techId');
  const limit = Number(searchParams.get('limit') || 100);
  const includeSummary = searchParams.get('summary') === 'true';

  if (techId) {
    const history = await getLocationHistory(techId, limit);
    const mileage = includeSummary ? await getMileageSummary(techId) : undefined;
    return NextResponse.json({ history, total: history.length, mileage });
  }

  const latest = await getLatestLocationsByTech();
  return NextResponse.json({ locations: latest, total: latest.length });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { techId, techName, techEmail, lat, lng, accuracy, speed, heading, timestamp } = body;

    if (!techId || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'techId, lat, lng are required' }, { status: 400 });
    }

    const point = await addLocationPoint({
      techId,
      techName,
      techEmail,
      lat,
      lng,
      accuracy,
      speed,
      heading,
      timestamp: timestamp || new Date().toISOString(),
    });

    return NextResponse.json({ point }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to save location' }, { status: 500 });
  }
}
