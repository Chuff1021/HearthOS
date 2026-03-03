import { NextRequest, NextResponse } from 'next/server';
import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';

interface TeamInvitation {
  id: string;
  email: string;
  name: string;
  role: string;
  status: 'pending' | 'sent' | 'accepted' | 'expired';
  createdAt: string;
}

const FILE = 'team-invitations.json';

export async function GET() {
  const invitations = readJsonFile<TeamInvitation[]>(FILE, []);
  return NextResponse.json({ invitations, total: invitations.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.email || !body.name) {
    return NextResponse.json({ error: 'email and name required' }, { status: 400 });
  }

  const invitations = readJsonFile<TeamInvitation[]>(FILE, []);
  const invite: TeamInvitation = {
    id: `inv-${Date.now()}`,
    email: body.email,
    name: body.name,
    role: body.role || 'tech',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  invitations.unshift(invite);
  writeJsonFileWithBackup(FILE, invitations);

  return NextResponse.json({ invitation: invite }, { status: 201 });
}
