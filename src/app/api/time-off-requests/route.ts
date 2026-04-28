import { NextRequest, NextResponse } from 'next/server';
import { db, timeOffRequests } from '@/db';
import { and, eq, desc } from 'drizzle-orm';

// Postgres-backed time-off requests. Tech app POSTs from /tech/profile;
// /admin/time reads them and PUTs to approve/deny. Was a JSON file before —
// which silently lost data on Vercel because lambdas don't share a filesystem.

const ALLOWED_TYPES = new Set(['paid_vacation', 'unpaid_vacation', 'unpaid_appointment_time']);
const ALLOWED_STATUSES = new Set(['pending', 'approved', 'denied']);

function shape(r: typeof timeOffRequests.$inferSelect) {
  return {
    id: r.id,
    techId: r.techId,
    techName: r.techName ?? undefined,
    type: r.type,
    startDate: r.startDate,
    endDate: r.endDate,
    reason: r.reason ?? undefined,
    status: r.status as 'pending' | 'approved' | 'denied',
    createdAt: r.createdAt?.toISOString(),
    updatedAt: r.updatedAt?.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const techId = searchParams.get('techId');
    const status = searchParams.get('status');

    const where = [] as any[];
    if (techId) where.push(eq(timeOffRequests.techId, techId));
    if (status && ALLOWED_STATUSES.has(status)) where.push(eq(timeOffRequests.status, status));

    const rows = await db
      .select()
      .from(timeOffRequests)
      .where(where.length ? (where.length === 1 ? where[0] : and(...where)) : undefined)
      .orderBy(desc(timeOffRequests.createdAt));

    const requests = rows.map(shape);
    return NextResponse.json({ requests, total: requests.length });
  } catch (err: any) {
    console.error('Failed to read time-off requests:', err);
    return NextResponse.json({ error: err?.message || 'Failed to load' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { techId, techName, type, startDate, endDate, reason } = body || {};

    if (!techId || !type || !startDate || !endDate) {
      return NextResponse.json({ error: 'techId, type, startDate, endDate are required' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: `type must be one of ${[...ALLOWED_TYPES].join(', ')}` }, { status: 400 });
    }

    const id = `tor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [row] = await db
      .insert(timeOffRequests)
      .values({
        id,
        techId,
        techName: techName ?? null,
        type,
        startDate,
        endDate,
        reason: reason ?? null,
        status: 'pending',
      })
      .returning();

    return NextResponse.json({ request: shape(row) }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to create time-off request:', err);
    return NextResponse.json({ error: err?.message || 'Failed to save' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body || {};
    if (!id || !status) return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: `status must be one of ${[...ALLOWED_STATUSES].join(', ')}` }, { status: 400 });
    }

    const [row] = await db
      .update(timeOffRequests)
      .set({ status, updatedAt: new Date() })
      .where(eq(timeOffRequests.id, id))
      .returning();

    if (!row) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    return NextResponse.json({ request: shape(row) });
  } catch (err: any) {
    console.error('Failed to update time-off request:', err);
    return NextResponse.json({ error: err?.message || 'Failed to update' }, { status: 500 });
  }
}
