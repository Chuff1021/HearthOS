import postgres from 'postgres';

export function getSql() {
  if (!process.env.DATABASE_URL) return null;
  return postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
}

export async function ensureSupportTables() {
  const sql = getSql();
  if (!sql) return;
  await sql`create table if not exists gabe_support_conversations (
    id bigserial primary key,
    ts timestamptz not null default now(),
    chatwoot_conversation_id text,
    chatwoot_message_id text,
    run_outcome text,
    handoff boolean not null default false,
    payload jsonb not null
  )`;
}

export async function insertSupportConversation(payload: Record<string, unknown>) {
  const sql = getSql();
  if (!sql) return null;
  await ensureSupportTables();
  const convId = String(payload.chatwoot_conversation_id || '');
  const msgId = String(payload.chatwoot_message_id || '');
  const outcome = String(payload.run_outcome || '');
  const handoff = Boolean(payload.handoff);
  const rows = await sql<{ id: number }[]>`insert into gabe_support_conversations (chatwoot_conversation_id, chatwoot_message_id, run_outcome, handoff, payload)
    values (${convId}, ${msgId}, ${outcome}, ${handoff}, ${JSON.stringify(payload)}::jsonb)
    returning id`;
  return rows[0]?.id || null;
}
