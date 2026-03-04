import { readJsonFile } from '@/lib/persist-json';

export interface DirectoryTech {
  id: string;
  name: string;
  email: string;
  phone?: string;
  color: string;
  initials: string;
  role: 'lead' | 'tech' | 'helper' | 'dispatcher' | 'admin';
  active: boolean;
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

function mapDbRole(role: string): DirectoryTech['role'] {
  if (role === 'admin') return 'admin';
  if (role === 'dispatcher') return 'dispatcher';
  return 'tech';
}

function fromDbUser(u: any): DirectoryTech {
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
  };
}

export async function getTechDirectory(): Promise<DirectoryTech[]> {
  try {
    const [{ db, users }, { eq }, { getOrCreateDefaultOrg }] = await Promise.all([
      import('@/db'),
      import('drizzle-orm'),
      import('@/lib/org'),
    ]);
    const org = await getOrCreateDefaultOrg();
    const rows = await db.select().from(users).where(eq(users.orgId, org.id));
    return (rows as any[])
      .map((u) => fromDbUser(u))
      .filter((t) => ['tech', 'dispatcher', 'admin'].includes(t.role));
  } catch {
    const store = readJsonFile<{ techs: DirectoryTech[] }>('techs.json', { techs: [] });
    return Array.isArray(store.techs) ? store.techs : [];
  }
}
