import postgres from 'postgres';

export interface GabeConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface GabeMessage {
  id: string;
  sessionId: string;
  timestamp: string;
  lastActivityAt: string;
  status: 'open' | 'closed';
  techId?: string;
  techName?: string;
  techEmail?: string;
  jobId?: string;
  jobNumber?: string;
  customerName?: string;
  fireplace?: string;
  messages: GabeConversationTurn[];
  duration?: number;
  rating?: number;
  flagged?: boolean;
  flagReason?: string;
}

let sqlClient: ReturnType<typeof postgres> | null = null;
let initPromise: Promise<void> | null = null;

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for GABE audit persistence');
  if (!sqlClient) {
    sqlClient = postgres(process.env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  }
  return sqlClient;
}

async function ensureTables() {
  const sql = getSql();
  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        create table if not exists gabe_chat_sessions (
          id text primary key,
          session_id text not null,
          ts timestamptz not null default now(),
          last_activity_at timestamptz not null default now(),
          status text not null default 'open',
          tech_id text,
          tech_name text,
          tech_email text,
          job_id text,
          job_number text,
          customer_name text,
          fireplace text,
          messages jsonb not null default '[]'::jsonb,
          duration integer,
          rating integer,
          flagged boolean default false,
          flag_reason text
        );
      `;
      await sql`create index if not exists idx_gabe_sessions_tech on gabe_chat_sessions (tech_id, last_activity_at desc);`;
      await sql`create index if not exists idx_gabe_sessions_email on gabe_chat_sessions (tech_email, last_activity_at desc);`;
      await sql`create index if not exists idx_gabe_sessions_status on gabe_chat_sessions (status, last_activity_at desc);`;
    })();
  }
  await initPromise;
}

function mapRow(r: any): GabeMessage {
  return {
    id: r.id,
    sessionId: r.session_id,
    timestamp: new Date(r.ts).toISOString(),
    lastActivityAt: new Date(r.last_activity_at).toISOString(),
    status: r.status,
    techId: r.tech_id || undefined,
    techName: r.tech_name || undefined,
    techEmail: r.tech_email || undefined,
    jobId: r.job_id || undefined,
    jobNumber: r.job_number || undefined,
    customerName: r.customer_name || undefined,
    fireplace: r.fireplace || undefined,
    messages: Array.isArray(r.messages) ? r.messages : [],
    duration: r.duration ?? undefined,
    rating: r.rating ?? undefined,
    flagged: !!r.flagged,
    flagReason: r.flag_reason || undefined,
  };
}

function dedupeAndAppend(existing: GabeConversationTurn[], incoming: GabeConversationTurn[]) {
  const key = (t: GabeConversationTurn) => `${t.role}|${(t.content || '').trim()}`;
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const turn of incoming) {
    const k = key(turn);
    if (seen.has(k)) continue;
    out.push(turn);
    seen.add(k);
  }
  return out.slice(-200);
}

function newId() {
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function newSessionId(techId?: string) {
  const base = techId || 'anon';
  return `sess-${base}-${Date.now()}`;
}

export async function getGabeMessages(filters?: {
  techId?: string;
  jobId?: string;
  startDate?: string;
  endDate?: string;
  flagged?: boolean;
}): Promise<GabeMessage[]> {
  const sql = getSql();
  await ensureTables();
  const rows: any[] = await sql`select * from gabe_chat_sessions order by last_activity_at desc limit 1000`;
  let msgs = rows.map(mapRow);
  if (filters?.techId) msgs = msgs.filter((m) => m.techId === filters.techId);
  if (filters?.jobId) msgs = msgs.filter((m) => m.jobId === filters.jobId);
  if (filters?.startDate) msgs = msgs.filter((m) => m.timestamp >= filters.startDate!);
  if (filters?.endDate) msgs = msgs.filter((m) => m.timestamp <= filters.endDate!);
  if (filters?.flagged !== undefined) msgs = msgs.filter((m) => !!m.flagged === filters.flagged);
  return msgs;
}

export async function getGabeMessageById(id: string): Promise<GabeMessage | undefined> {
  const sql = getSql();
  await ensureTables();
  const rows: any[] = await sql`select * from gabe_chat_sessions where id = ${id} limit 1`;
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function saveGabeMessage(message: Omit<GabeMessage, 'id' | 'timestamp' | 'lastActivityAt' | 'status' | 'sessionId'>): Promise<GabeMessage> {
  const sql = getSql();
  await ensureTables();

  const nowIso = new Date().toISOString();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const identityField = message.techId ? 'tech_id' : (message.techEmail ? 'tech_email' : null);
  let openRows: any[] = [];
  if (identityField === 'tech_id') {
    openRows = await sql`select * from gabe_chat_sessions where tech_id = ${message.techId!} and status='open' and last_activity_at >= ${cutoff} order by last_activity_at desc limit 1`;
  } else if (identityField === 'tech_email') {
    openRows = await sql`select * from gabe_chat_sessions where tech_email = ${message.techEmail!} and status='open' and last_activity_at >= ${cutoff} order by last_activity_at desc limit 1`;
  }

  // Close stale open sessions for this tech/email
  if (identityField === 'tech_id') {
    await sql`update gabe_chat_sessions set status='closed' where tech_id = ${message.techId!} and status='open' and last_activity_at < ${cutoff}`;
  } else if (identityField === 'tech_email') {
    await sql`update gabe_chat_sessions set status='closed' where tech_email = ${message.techEmail!} and status='open' and last_activity_at < ${cutoff}`;
  }

  const incoming = (message.messages || []).slice(-4);

  if (openRows[0]) {
    const existing = mapRow(openRows[0]);
    const mergedMessages = dedupeAndAppend(existing.messages, incoming);
    await sql`
      update gabe_chat_sessions
      set last_activity_at = ${nowIso},
          status = 'open',
          tech_name = ${message.techName || existing.techName || null},
          tech_email = ${message.techEmail || existing.techEmail || null},
          job_id = ${message.jobId || existing.jobId || null},
          job_number = ${message.jobNumber || existing.jobNumber || null},
          customer_name = ${message.customerName || existing.customerName || null},
          fireplace = ${message.fireplace || existing.fireplace || null},
          messages = ${JSON.stringify(mergedMessages)}::jsonb,
          duration = ${message.duration ?? existing.duration ?? null}
      where id = ${existing.id}
    `;
    return (await getGabeMessageById(existing.id))!;
  }

  const id = newId();
  const sessionId = newSessionId(message.techId);
  await sql`
    insert into gabe_chat_sessions (
      id, session_id, ts, last_activity_at, status,
      tech_id, tech_name, tech_email, job_id, job_number, customer_name, fireplace,
      messages, duration, rating, flagged, flag_reason
    ) values (
      ${id}, ${sessionId}, ${nowIso}, ${nowIso}, 'open',
      ${message.techId || null}, ${message.techName || null}, ${message.techEmail || null}, ${message.jobId || null}, ${message.jobNumber || null}, ${message.customerName || null}, ${message.fireplace || null},
      ${JSON.stringify(incoming)}::jsonb, ${message.duration ?? null}, null, false, null
    )
  `;

  return (await getGabeMessageById(id))!;
}

export async function updateGabeMessage(id: string, updates: Partial<GabeMessage>): Promise<GabeMessage | null> {
  const sql = getSql();
  await ensureTables();
  const existing = await getGabeMessageById(id);
  if (!existing) return null;

  const merged = {
    ...existing,
    ...updates,
    messages: updates.messages ? dedupeAndAppend(existing.messages, updates.messages) : existing.messages,
  };

  await sql`
    update gabe_chat_sessions set
      last_activity_at = ${new Date().toISOString()},
      status = ${merged.status},
      tech_name = ${merged.techName || null},
      tech_email = ${merged.techEmail || null},
      job_id = ${merged.jobId || null},
      job_number = ${merged.jobNumber || null},
      customer_name = ${merged.customerName || null},
      fireplace = ${merged.fireplace || null},
      messages = ${JSON.stringify(merged.messages)}::jsonb,
      duration = ${merged.duration ?? null},
      rating = ${merged.rating ?? null},
      flagged = ${!!merged.flagged},
      flag_reason = ${merged.flagReason || null}
    where id = ${id}
  `;

  return await getGabeMessageById(id) || null;
}

export async function flagGabeMessage(id: string, reason: string): Promise<GabeMessage | null> {
  return updateGabeMessage(id, { flagged: true, flagReason: reason });
}

export async function deleteGabeMessage(id: string): Promise<boolean> {
  const sql = getSql();
  await ensureTables();
  const res = await sql`delete from gabe_chat_sessions where id = ${id}`;
  return (res.count || 0) > 0;
}

export async function getGabeMessageStats() {
  const messages = await getGabeMessages();
  const total = messages.length;
  const todayPrefix = new Date().toISOString().split('T')[0];
  const today = messages.filter((m) => m.timestamp.startsWith(todayPrefix)).length;
  const flagged = messages.filter((m) => !!m.flagged).length;
  const rated = messages.filter((m) => typeof m.rating === 'number');
  const avgRating = rated.length ? rated.reduce((sum, m) => sum + (m.rating || 0), 0) / rated.length : 0;

  const techs = messages
    .filter((m) => m.techId || m.techName)
    .reduce<Record<string, { techId: string; techName: string; count: number }>>((acc, m) => {
      const key = m.techId || m.techName || 'unknown';
      if (!acc[key]) {
        acc[key] = {
          techId: m.techId || key,
          techName: m.techName || m.techId || 'Unknown Tech',
          count: 0,
        };
      }
      acc[key].count += 1;
      return acc;
    }, {});

  return {
    total,
    today,
    flagged,
    avgRating,
    techs: Object.values(techs).sort((a, b) => b.count - a.count),
  };
}
