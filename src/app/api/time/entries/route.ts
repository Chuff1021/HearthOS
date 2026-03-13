import { NextRequest, NextResponse } from 'next/server';
import { createTimeEntry, closeOpenTimeEntry, listTimeEntries, updateTimeEntry } from '@/lib/time-entry-store';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const techId = searchParams.get('techId');
  const openOnly = searchParams.get('openOnly') === 'true';
  const date = searchParams.get('date');

  const entries = await listTimeEntries({
    techId: techId || undefined,
    openOnly,
    date: date || undefined,
  });

  return NextResponse.json({ entries, total: entries.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action as 'clock_in' | 'clock_out';
  const techId = body.techId as string;
  const techName = body.techName as string | undefined;

  if (!action || !techId) {
    return NextResponse.json({ error: 'action and techId are required' }, { status: 400 });
  }

  if (action === 'clock_in') {
    const { entry, alreadyOpen } = await createTimeEntry({ techId, techName });
    return NextResponse.json({ entry, alreadyOpen }, { status: alreadyOpen ? 200 : 201 });
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
