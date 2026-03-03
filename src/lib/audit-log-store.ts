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

export function addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'at'>): AuditLogEntry {
  const record: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...entry,
  };
  logs.unshift(record);
  return record;
}

export function getAuditLogs(filters?: { entityType?: AuditEntity; entityId?: string; limit?: number }) {
  let out = [...logs];
  if (filters?.entityType) out = out.filter((l) => l.entityType === filters.entityType);
  if (filters?.entityId) out = out.filter((l) => l.entityId === filters.entityId);
  return out.slice(0, filters?.limit ?? 200);
}
