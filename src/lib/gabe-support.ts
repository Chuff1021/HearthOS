import postgres from 'postgres';
import { isTenantStorageEnabled, resolveStorageOrgId } from '@/lib/tenant/storage';

type SupportScope = string | { orgId: string; trustedSystem: true };

async function scopedOrgId(scope?: SupportScope) {
  if (typeof scope === 'object' && scope.trustedSystem) return scope.orgId;
  return resolveStorageOrgId(typeof scope === 'string' ? scope : undefined);
}

export function getSql() {
  if (!process.env.DATABASE_URL) return null;
  return postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
}

export async function ensureSupportTables() {
  const sql = getSql();
  if (!sql) return;
  await sql`create table if not exists gabe_support_conversations (
    id bigserial primary key,
    org_id uuid references organizations(id) on delete cascade,
    ts timestamptz not null default now(),
    chatwoot_conversation_id text,
    chatwoot_message_id text,
    run_outcome text,
    handoff boolean not null default false,
    payload jsonb not null
  )`;
}

export async function insertSupportConversation(payload: Record<string, unknown>, scope?: SupportScope) {
  const sql = getSql();
  if (!sql) return null;
  await ensureSupportTables();
  const convId = String(payload.chatwoot_conversation_id || '');
  const msgId = String(payload.chatwoot_message_id || '');
  const outcome = String(payload.run_outcome || '');
  const handoff = Boolean(payload.handoff);
  const orgId = await scopedOrgId(scope);
  const rows = isTenantStorageEnabled()
    ? await sql<{ id: number }[]>`insert into gabe_support_conversations (org_id, chatwoot_conversation_id, chatwoot_message_id, run_outcome, handoff, payload)
        values (${orgId!}, ${convId}, ${msgId}, ${outcome}, ${handoff}, ${JSON.stringify(payload)}::jsonb)
        returning id`
    : await sql<{ id: number }[]>`insert into gabe_support_conversations (chatwoot_conversation_id, chatwoot_message_id, run_outcome, handoff, payload)
        values (${convId}, ${msgId}, ${outcome}, ${handoff}, ${JSON.stringify(payload)}::jsonb)
        returning id`;
  return rows[0]?.id || null;
}
