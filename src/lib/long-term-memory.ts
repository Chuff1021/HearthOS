import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';
import postgres from 'postgres';
import { isTenantStorageEnabled, resolveStorageOrgId } from '@/lib/tenant/storage';

type MemoryEvent = {
  id: string;
  timestamp: string;
  entity: string;
  action: 'create' | 'update' | 'delete';
  entityId: string;
  summary: string;
  payload?: unknown;
};

const FILE = 'long-term-memory-events.json';

export async function appendMemoryEvent(event: Omit<MemoryEvent, 'id' | 'timestamp'>) {
  const id = `mem-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const timestamp = new Date().toISOString();

  if (isTenantStorageEnabled()) {
    if (!process.env.DATABASE_URL) {
      throw new Error('Tenant memory persistence requires DATABASE_URL.');
    }
    const orgId = await resolveStorageOrgId();
    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
    try {
      await sql`
        insert into tenant_memory_events (
          id, org_id, ts, entity, action, entity_id, summary, payload
        ) values (
          ${id}, ${orgId!}, ${timestamp}, ${event.entity}, ${event.action},
          ${event.entityId}, ${event.summary}, ${event.payload === undefined ? null : JSON.stringify(event.payload)}::jsonb
        )
      `;
    } finally {
      await sql.end();
    }
    return;
  }

  const items = readJsonFile<MemoryEvent[]>(FILE, []);
  items.unshift({
    id,
    timestamp,
    ...event,
  });
  writeJsonFileWithBackup(FILE, items.slice(0, 5000));
}
