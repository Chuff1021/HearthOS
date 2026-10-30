import { authorizeCrmApi } from "@/lib/security/crm-access";
import { requireCrmActor } from "@/lib/security/crm-access";
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { addLocationPoint, getLatestLocationsByTech, getLocationHistory, getMileageSummary } from '@/lib/tech-location-store';
import { getOpenTimeEntry } from '@/lib/time-entry-store';
import { parseGpsPoint } from '@/lib/tech-gps-validation';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const accessDenied = await authorizeCrmApi("/api/tech/locations", "GET");
  if (accessDenied) return accessDenied;
  try {
  const { searchParams } = new URL(request.url);
  const actor = await requireCrmActor();
  if (searchParams.get('session') === 'true') {
    const entry = await getOpenTimeEntry([actor.employeeId, actor.clerkUserId]);
    return NextResponse.json({ trackingAllowed: actor.role === 'owner' || !!entry, clockedIn: !!entry }, { headers });
  }
  const techId = actor.role === "technician" ? actor.employeeId : searchParams.get('techId');
  const requestedLimit = Number(searchParams.get('limit') || 100);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(1000, Math.floor(requestedLimit))) : 100;
  const includeSummary = searchParams.get('summary') === 'true';

  if (techId) {
    const history = await getLocationHistory(techId, limit, actor.orgId);
    const mileage = includeSummary ? await getMileageSummary(techId, actor.orgId) : undefined;
    return NextResponse.json({ history, total: history.length, mileage }, { headers });
  }

  const latest = await getLatestLocationsByTech(actor.orgId);
  return NextResponse.json({ locations: latest, total: latest.length }, { headers });
  } catch {
    return NextResponse.json({ error: 'Location status unavailable. Please retry.' }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  const accessDenied = await authorizeCrmApi("/api/tech/locations", "POST");
  if (accessDenied) return accessDenied;
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Same-origin request required' }, { status: 403, headers });
  }
  try {
    const actor = await requireCrmActor();
    const body = await request.json().catch(() => null);
    const coordinates = parseGpsPoint(body);
    if (!coordinates) return NextResponse.json({ error: 'A valid, recent location is required' }, { status: 400, headers });
    if (actor.role !== 'owner' && !await getOpenTimeEntry([actor.employeeId, actor.clerkUserId])) {
      return NextResponse.json({ error: 'Clock in to share your location' }, { status: 403, headers });
    }
    const techId = actor.employeeId;
    const techName = actor.name;
    const techEmail = actor.email;

    const point = await addLocationPoint({
      techId,
      techName,
      techEmail,
      ...coordinates,
    }, actor.orgId);

    return NextResponse.json({ point }, { status: 201, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to save location' }, { status: 503, headers });
  }
}
