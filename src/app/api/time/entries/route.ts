import { NextRequest, NextResponse } from 'next/server';
import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';

interface TimeEntry {
  id: string;
  techId: string;
  techName?: string;
  clockInAt: string;
  clockOutAt?: string;
  totalMinutes?: number;
  status: 'open' | 'closed';
  edited?: boolean;
  editNote?: string;
  createdAt: string;
  updatedAt: string;
}

const FILE = 'time-entries.json';

function getEntries() {
  return readJsonFile<TimeEntry[]>(FILE, []);
}

function saveEntries(entries: TimeEntry[]) {
  writeJsonFileWithBackup(FILE, entries);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const techId = searchParams.get('techId');
  const openOnly = searchParams.get('openOnly') === 'true';
  const date = searchParams.get('date');

  let entries = getEntries();
  if (techId) entries = entries.filter((e) => e.techId === techId);
  if (openOnly) entries = entries.filter((e) => e.status === 'open');
  if (date) entries = entries.filter((e) => e.clockInAt.startsWith(date));

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

  const entries = getEntries();

  if (action === 'clock_in') {
    const open = entries.find((e) => e.techId === techId && e.status === 'open');
    if (open) return NextResponse.json({ entry: open, alreadyOpen: true });

    const now = new Date().toISOString();
    const entry: TimeEntry = {
      id: `te-${Date.now()}`,
      techId,
      techName,
      clockInAt: now,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    entries.unshift(entry);
    saveEntries(entries);
    return NextResponse.json({ entry }, { status: 201 });
  }

  const openIdx = entries.findIndex((e) => e.techId === techId && e.status === 'open');
  if (openIdx === -1) return NextResponse.json({ error: 'No open time entry found' }, { status: 404 });

  const now = new Date().toISOString();
  const inAt = new Date(entries[openIdx].clockInAt).getTime();
  const outAt = new Date(now).getTime();
  const totalMinutes = Math.max(0, Math.round((outAt - inAt) / 60000));

  entries[openIdx] = {
    ...entries[openIdx],
    clockOutAt: now,
    totalMinutes,
    status: 'closed',
    updatedAt: now,
  };

  saveEntries(entries);
  return NextResponse.json({ entry: entries[openIdx] });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, clockInAt, clockOutAt, editNote } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const entries = getEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });

  const inAt = clockInAt || entries[idx].clockInAt;
  const outAt = clockOutAt || entries[idx].clockOutAt;
  let totalMinutes = entries[idx].totalMinutes;
  let status = entries[idx].status;

  if (outAt) {
    totalMinutes = Math.max(0, Math.round((new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000));
    status = 'closed';
  } else {
    status = 'open';
  }

  entries[idx] = {
    ...entries[idx],
    clockInAt: inAt,
    clockOutAt: outAt,
    totalMinutes,
    status,
    edited: true,
    editNote: editNote || entries[idx].editNote,
    updatedAt: new Date().toISOString(),
  };

  saveEntries(entries);
  return NextResponse.json({ entry: entries[idx] });
}
