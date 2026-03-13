import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';
import { appendMemoryEvent } from '@/lib/long-term-memory';
import { isClerkConfigured } from '@/lib/auth';

type DbCtx = {
  db: any;
  users: any;
  eq: any;
  and: any;
  getOrCreateDefaultOrg: () => Promise<{ id: string }>;
};

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

async function getDbCtx(): Promise<DbCtx | null> {
  try {
    const [{ db, users }, { eq, and }, { getOrCreateDefaultOrg }] = await Promise.all([
      import('@/db'),
      import('drizzle-orm'),
      import('@/lib/org'),
    ]);
    return { db, users, eq, and, getOrCreateDefaultOrg };
  } catch {
    return null;
  }
}

function mapDbRole(role: string): Tech['role'] {
  if (role === 'admin') return 'admin';
  if (role === 'dispatcher') return 'dispatcher';
  return 'tech';
}

function toInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function fromDbUser(u: any): Tech {
  const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Tech';
  return {
    id: String(u.id),
    name,
    email: String(u.email || ''),
    phone: String(u.phone || ''),
    color: String(u.techColor || '#2563EB'),
    initials: toInitials(name),
    role: mapDbRole(String(u.role || 'technician')),
    active: !!u.isActive,
    skills: Array.isArray(u.techSkills) ? u.techSkills : [],
    certifications: [],
    hireDate: (u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
  };
}

async function sendClerkInvite(email: string, role: Tech['role'], origin?: string) {
  if (!isClerkConfigured()) return { sent: false, reason: 'clerk_not_configured' };
  try {
    const client = await clerkClient();
    const inviteRedirect = process.env.CLERK_INVITE_REDIRECT_URL
      || (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/sign-up` : undefined)
      || (origin ? `${origin.replace(/\/$/, '')}/sign-up` : undefined);

    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: inviteRedirect,
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

    const dbCtx = await getDbCtx();
    if (dbCtx) {
      const org = await dbCtx.getOrCreateDefaultOrg();
      const rows = await dbCtx.db
        .select()
        .from(dbCtx.users)
        .where(dbCtx.eq(dbCtx.users.orgId, org.id));
      const techs: Tech[] = (rows as any[])
        .map((u) => fromDbUser(u))
        .filter((t: Tech) => ['tech', 'dispatcher', 'admin'].includes(t.role));

      // Keep file cache in sync for legacy readers (dispatch/jobs paths)
      const cache = loadStore();
      cache.techs = techs;
      saveStore(cache);

      return NextResponse.json({ techs: activeOnly ? techs.filter((t) => t.active) : techs });
    }

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
    const origin = new URL(request.url).origin;

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const role = (body.role || 'tech') as Tech['role'];

    if (!name || !email) return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });

    const dbCtx = await getDbCtx();
    if (dbCtx) {
      const org = await dbCtx.getOrCreateDefaultOrg();
      const existingRows = await dbCtx.db
        .select()
        .from(dbCtx.users)
        .where(dbCtx.and(dbCtx.eq(dbCtx.users.orgId, org.id), dbCtx.eq(dbCtx.users.email, email)))
        .limit(1);

      if (existingRows.length > 0) {
        const tech = fromDbUser(existingRows[0]);
        const invite = await sendClerkInvite(email, tech.role, origin);
        return NextResponse.json({ tech, exists: true, invite }, { status: 200 });
      }

      const parts = name.split(' ').filter(Boolean);
      const firstName = parts[0] || 'Tech';
      const lastName = parts.slice(1).join(' ') || 'Member';
      const dbRole = role === 'admin' ? 'admin' : role === 'dispatcher' ? 'dispatcher' : 'technician';

      const inserted = await dbCtx.db
        .insert(dbCtx.users)
        .values({
          orgId: org.id,
          email,
          phone: phone || null,
          firstName,
          lastName,
          role: dbRole,
          isActive: true,
          techColor: body.color || '#2563EB',
          techSkills: body.skills || [],
        })
        .returning();

      const tech = fromDbUser(inserted[0]);

      // Mirror into file cache for legacy readers
      const cache = loadStore();
      if (!cache.techs.find((t) => t.id === tech.id)) {
        cache.techs.push(tech);
        saveStore(cache);
      }

      appendMemoryEvent({ entity: 'tech', action: 'create', entityId: tech.id, summary: `Tech created: ${tech.name}`, payload: { tech } });
      const invite = await sendClerkInvite(email, tech.role, origin);
      return NextResponse.json({ tech, invite }, { status: 201 });
    }

    const existing = store.techs.find((t) => t.email.toLowerCase() === email);
    if (existing) {
      const invite = await sendClerkInvite(email, existing.role, origin);
      return NextResponse.json({ tech: existing, exists: true, invite }, { status: 200 });
    }

    const newTech: Tech = {
      id: `tech-${String(store.nextId++).padStart(3, '0')}`,
      name,
      email,
      phone,
      color: body.color || '#2563EB',
      initials: toInitials(name),
      role,
      active: true,
      skills: body.skills || [],
      certifications: body.certifications || [],
      hireDate: new Date().toISOString().split('T')[0],
    };

    store.techs.push(newTech);
    saveStore(store);
    appendMemoryEvent({ entity: 'tech', action: 'create', entityId: newTech.id, summary: `Tech created: ${newTech.name}`, payload: { tech: newTech } });
    const invite = await sendClerkInvite(email, newTech.role, origin);
    return NextResponse.json({ tech: newTech, invite }, { status: 201 });
  } catch (err) {
    console.error('Failed to create tech:', err);
    return NextResponse.json({ error: 'Failed to create technician' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const hardDelete = searchParams.get('hard') === 'true';
    if (!id) return NextResponse.json({ error: 'Tech ID required' }, { status: 400 });

    const dbCtx = await getDbCtx();
    if (dbCtx) {
      if (hardDelete) {
        await dbCtx.db.delete(dbCtx.users).where(dbCtx.eq(dbCtx.users.id, id));
      } else {
        await dbCtx.db.update(dbCtx.users).set({ isActive: false, updatedAt: new Date() }).where(dbCtx.eq(dbCtx.users.id, id));
      }

      // Mirror deletion/deactivation to file cache
      const cache = loadStore();
      const idx = cache.techs.findIndex((t) => t.id === id);
      if (idx >= 0) {
        if (hardDelete) {
          cache.techs.splice(idx, 1);
        } else {
          cache.techs[idx] = { ...cache.techs[idx], active: false };
        }
        saveStore(cache);
      }

      appendMemoryEvent({
        entity: 'tech',
        action: 'delete',
        entityId: id,
        summary: hardDelete ? `Tech hard-deleted: ${id}` : `Tech deactivated: ${id}`,
      });
      return NextResponse.json({ success: true });
    }

    const store = loadStore();
    const index = store.techs.findIndex((t) => t.id === id);
    if (index === -1) return NextResponse.json({ error: 'Technician not found' }, { status: 404 });
    const deleted = store.techs.splice(index, 1)[0];
    saveStore(store);
    appendMemoryEvent({ entity: 'tech', action: 'delete', entityId: deleted.id, summary: `Tech deleted: ${deleted.name}` });
    return NextResponse.json({ tech: deleted });
  } catch (err) {
    console.error('Failed to delete tech:', err);
    return NextResponse.json({ error: 'Failed to delete technician' }, { status: 500 });
  }
}
