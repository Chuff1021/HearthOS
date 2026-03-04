import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';
import { appendMemoryEvent } from '@/lib/long-term-memory';
import { isClerkConfigured } from '@/lib/auth';

export interface Tech {
  id: string;
  name: string;
  email: string;
  phone: string;
  color: string;
  initials: string;
  role: 'lead' | 'tech' | 'helper' | 'dispatcher' | 'admin';
  active: boolean;
  skills: string[];
  certifications: string[];
  hireDate: string;
}

const TECHS_FILE = 'techs.json';

type TechStore = { techs: Tech[]; nextId: number };

function loadStore(): TechStore {
  const store = readJsonFile<TechStore>(TECHS_FILE, { techs: [], nextId: 1 });
  if (!Array.isArray(store.techs)) store.techs = [];
  if (typeof store.nextId !== 'number') store.nextId = 1;
  return store;
}

function saveStore(store: TechStore) {
  writeJsonFileWithBackup(TECHS_FILE, store);
}

async function sendClerkInvite(email: string, role: Tech['role']) {
  if (!isClerkConfigured()) return { sent: false, reason: 'clerk_not_configured' };
  try {
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: process.env.CLERK_INVITE_REDIRECT_URL || `${process.env.NEXT_PUBLIC_APP_URL || ''}/sign-up`,
      publicMetadata: { hearthRole: role },
      notify: true,
      ignoreExisting: true,
    } as any);
    return { sent: true, id: invitation?.id };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'invite_failed' };
  }
}

export function getTechs(): Tech[] {
  return loadStore().techs;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const techs = getTechs();
    return NextResponse.json({ techs: activeOnly ? techs.filter((t) => t.active) : techs });
  } catch (err) {
    console.error('Failed to get techs:', err);
    return NextResponse.json({ error: 'Failed to get technicians' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const store = loadStore();
    const body = await request.json();

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const role = (body.role || 'tech') as Tech['role'];

    if (!name || !email) return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });

    const existing = store.techs.find((t) => t.email.toLowerCase() === email);
    if (existing) {
      const invite = await sendClerkInvite(email, existing.role);
      return NextResponse.json({ tech: existing, exists: true, invite }, { status: 200 });
    }

    const initials = name
      .split(' ')
      .filter(Boolean)
      .map((n: string) => n[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();

    const newTech: Tech = {
      id: `tech-${String(store.nextId++).padStart(3, '0')}`,
      name,
      email,
      phone,
      color: body.color || '#2563EB',
      initials,
      role,
      active: true,
      skills: body.skills || [],
      certifications: body.certifications || [],
      hireDate: new Date().toISOString().split('T')[0],
    };

    store.techs.push(newTech);
    saveStore(store);
    appendMemoryEvent({
      entity: 'tech',
      action: 'create',
      entityId: newTech.id,
      summary: `Tech created: ${newTech.name}`,
      payload: { tech: newTech },
    });

    const invite = await sendClerkInvite(email, newTech.role);

    return NextResponse.json({ tech: newTech, invite }, { status: 201 });
  } catch (err) {
    console.error('Failed to create tech:', err);
    return NextResponse.json({ error: 'Failed to create technician' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const store = loadStore();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Tech ID required' }, { status: 400 });

    const index = store.techs.findIndex((t) => t.id === id);
    if (index === -1) return NextResponse.json({ error: 'Technician not found' }, { status: 404 });

    const deleted = store.techs.splice(index, 1)[0];
    saveStore(store);
    appendMemoryEvent({
      entity: 'tech',
      action: 'delete',
      entityId: deleted.id,
      summary: `Tech deleted: ${deleted.name}`,
    });
    return NextResponse.json({ tech: deleted });
  } catch (err) {
    console.error('Failed to delete tech:', err);
    return NextResponse.json({ error: 'Failed to delete technician' }, { status: 500 });
  }
}
