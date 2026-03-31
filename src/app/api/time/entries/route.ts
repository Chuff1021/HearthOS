import { NextRequest, NextResponse } from 'next/server';
import { createTimeEntry, closeOpenTimeEntry, listTimeEntries, updateTimeEntry } from '@/lib/time-entry-store';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const techId = searchParams.get('techId');
  const openOnly = searchParams.get('openOnly') === 'true';
  const date = searchParams.get('date');
  const weekOf = searchParams.get('weekOf'); // YYYY-MM-DD, returns Mon-Sun of that week

  let entries = await listTimeEntries({
    techId: techId || undefined,
    openOnly,
    date: date || undefined,
  });

  // Filter by week if requested
  if (weekOf) {
    const base = new Date(weekOf + 'T00:00:00');
    const dayOfWeek = base.getDay();
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((dayOfWeek + 6) % 7)); // Monday
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); // Sunday
    sunday.setHours(23, 59, 59, 999);

    entries = entries.filter((e) => {
      const d = new Date(e.clockInAt);
      return d >= monday && d <= sunday;
    });
  }

  return NextResponse.json({ entries, total: entries.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action as 'clock_in' | 'clock_out' | 'manual_entry';
  const techId = body.techId as string;
  const techName = body.techName as string | undefined;

  if (!action || !techId) {
    return NextResponse.json({ error: 'action and techId are required' }, { status: 400 });
  }

  if (action === 'clock_in') {
    const { entry, alreadyOpen } = await createTimeEntry({ techId, techName });
    return NextResponse.json({ entry, alreadyOpen }, { status: alreadyOpen ? 200 : 201 });
  }

  if (action === 'manual_entry') {
    const { clockInAt, clockOutAt } = body;
    if (!clockInAt || !clockOutAt) {
      return NextResponse.json({ error: 'clockInAt and clockOutAt required for manual entry' }, { status: 400 });
    }
    // Create entry directly via the store — do NOT use createTimeEntry
    // because it returns existing open entries instead of creating new ones
    const { createManualTimeEntry } = await import('@/lib/time-entry-store');
    const entry = await createManualTimeEntry({
      techId,
      techName,
      clockInAt,
      clockOutAt,
      editNote: body.editNote || 'Manual entry by admin',
    });
    return NextResponse.json({ entry }, { status: 201 });
  }

  const entry = await closeOpenTimeEntry(techId);
  if (!entry) return NextResponse.json({ error: 'No open time entry found' }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, clockInAt, clockOutAt, editNote } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const entry = await updateTimeEntry({ id, clockInAt, clockOutAt, editNote });
  if (!entry) return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Soft delete by marking as edited with note
  const entry = await updateTimeEntry({ id, editNote: 'Deleted by admin' });
  return NextResponse.json({ success: true, entry });
}
