import { and, desc, eq } from 'drizzle-orm';
import { auditLogs, db } from '@/db';
import { isTenantStorageEnabled, resolveStorageOrgId } from '@/lib/tenant/storage';
import { requireTenantContext } from '@/lib/tenant/context';

export type AuditEntity = 'invoice' | 'estimate' | 'purchase_order' | 'schedule_job';

export interface AuditLogEntry {
  id: string;
  entityType: AuditEntity;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'sync' | 'ai_generate';
  actor: string;
  source: 'ui' | 'api' | 'quickbooks_sync' | 'ai';
  at: string;
  before?: unknown;
  after?: unknown;
  note?: string;
}

const logs: AuditLogEntry[] = [];

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'at'>): Promise<AuditLogEntry> {
  if (isTenantStorageEnabled()) {
    const context = await requireTenantContext();
    const orgId = context.orgId;
    const [record] = await db.insert(auditLogs).values({
      orgId,
      actorIdentityId: context.identityId,
      supportSessionId: context.supportSessionId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: isUuid(entry.entityId) ? entry.entityId : null,
      oldValue: entry.before,
      newValue: entry.after,
      metadata: {
        externalEntityId: entry.entityId,
        actor: entry.actor,
        source: entry.source,
        note: entry.note,
        supportAccessMode: context.supportAccessMode,
      },
    }).returning();
    return {
      ...entry,
      id: record.id,
      at: record.createdAt?.toISOString() || new Date().toISOString(),
    };
  }

  const record: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...entry,
  };
  logs.unshift(record);
  return record;
}

export async function getAuditLogs(filters?: { entityType?: AuditEntity; entityId?: string; limit?: number }) {
  if (isTenantStorageEnabled()) {
    const orgId = await resolveStorageOrgId();
    const where = [eq(auditLogs.orgId, orgId!)];
    if (filters?.entityType) where.push(eq(auditLogs.entityType, filters.entityType));
    if (filters?.entityId && isUuid(filters.entityId)) where.push(eq(auditLogs.entityId, filters.entityId));
    const rows = await db.select().from(auditLogs)
      .where(and(...where))
      .orderBy(desc(auditLogs.createdAt))
      .limit(filters?.limit ?? 200);
    return rows
      .map((row): AuditLogEntry => {
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
        return {
          id: row.id,
          entityType: row.entityType as AuditEntity,
          entityId: String(metadata.externalEntityId || row.entityId || ''),
          action: row.action as AuditLogEntry['action'],
          actor: String(metadata.actor || 'system'),
          source: String(metadata.source || 'api') as AuditLogEntry['source'],
          at: row.createdAt?.toISOString() || new Date().toISOString(),
          before: row.oldValue,
          after: row.newValue,
          note: metadata.note ? String(metadata.note) : undefined,
        };
      })
      .filter((row) => !filters?.entityId || row.entityId === filters.entityId);
  }

  let out = [...logs];
  if (filters?.entityType) out = out.filter((log) => log.entityType === filters.entityType);
  if (filters?.entityId) out = out.filter((log) => log.entityId === filters.entityId);
  return out.slice(0, filters?.limit ?? 200);
}
