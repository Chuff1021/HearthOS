import { NextRequest, NextResponse } from 'next/server';
import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';

interface TimeOffRequest {
  id: string;
  techId: string;
  techName?: string;
  type: 'paid_vacation' | 'unpaid_vacation' | 'unpaid_appointment_time';
  startDate: string;
  endDate: string;
  reason?: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
  updatedAt: string;
}

const FILE = 'time-off-requests.json';

function getRequests() {
  return readJsonFile<TimeOffRequest[]>(FILE, []);
}

function saveRequests(requests: TimeOffRequest[]) {
  writeJsonFileWithBackup(FILE, requests);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const techId = searchParams.get('techId');
  const status = searchParams.get('status');

  let requests = getRequests();
  if (techId) requests = requests.filter((r) => r.techId === techId);
  if (status) requests = requests.filter((r) => r.status === status);

  return NextResponse.json({ requests, total: requests.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { techId, techName, type, startDate, endDate, reason } = body;

  if (!techId || !type || !startDate || !endDate) {
    return NextResponse.json({ error: 'techId, type, startDate, endDate are required' }, { status: 400 });
  }

  const requests = getRequests();
  const now = new Date().toISOString();
  const req: TimeOffRequest = {
    id: `tor-${Date.now()}`,
    techId,
    techName,
    type,
    startDate,
    endDate,
    reason,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  requests.unshift(req);
  saveRequests(requests);
  return NextResponse.json({ request: req }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, status } = body;
  if (!id || !status) return NextResponse.json({ error: 'id and status are required' }, { status: 400 });

  const requests = getRequests();
  const idx = requests.findIndex((r) => r.id === id);
  if (idx === -1) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  requests[idx] = { ...requests[idx], status, updatedAt: new Date().toISOString() };
  saveRequests(requests);
  return NextResponse.json({ request: requests[idx] });
}
