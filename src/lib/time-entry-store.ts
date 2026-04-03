import postgres from "postgres";
import { readJsonFile, writeJsonFileWithBackup } from "@/lib/persist-json";

export interface TimeEntry {
  id: string;
  techId: string;
  techName?: string;
  clockInAt: string;
  clockOutAt?: string;
  totalMinutes?: number;
  status: "open" | "closed";
  edited?: boolean;
  editNote?: string;
  createdAt: string;
  updatedAt: string;
}

const FILE = "time-entries.json";
let sqlClient: ReturnType<typeof postgres> | null = null;
let initPromise: Promise<void> | null = null;

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    null
  );
}

function getSql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) return null;
  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return sqlClient;
}

function loadFileEntries() {
  return readJsonFile<TimeEntry[]>(FILE, []);
}

function saveFileEntries(entries: TimeEntry[]) {
  writeJsonFileWithBackup(FILE, entries);
}

async function ensureTable() {
  const sql = getSql();
  if (!sql) return;

  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        create table if not exists hearth_time_entries (
          id text primary key,
          tech_id text not null,
          tech_name text,
          clock_in_at timestamptz not null,
          clock_out_at timestamptz,
          total_minutes integer,
          status text not null,
          edited boolean not null default false,
          edit_note text,
          payload jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
      `;
      await sql`create index if not exists idx_hearth_time_entries_tech on hearth_time_entries (tech_id, clock_in_at desc);`;
      await sql`create index if not exists idx_hearth_time_entries_status on hearth_time_entries (status, clock_in_at desc);`;

      const countRows = await sql<{ count: number }[]>`select count(*)::int as count from hearth_time_entries`;
      const count = countRows[0]?.count || 0;
      if (count === 0) {
        const fileEntries = loadFileEntries();
        for (const entry of fileEntries) {
          await sql`
            insert into hearth_time_entries (
              id, tech_id, tech_name, clock_in_at, clock_out_at, total_minutes, status, edited, edit_note, payload, created_at, updated_at
            ) values (
              ${entry.id},
              ${entry.techId},
              ${entry.techName || null},
              ${entry.clockInAt},
              ${entry.clockOutAt || null},
              ${entry.totalMinutes ?? null},
              ${entry.status},
              ${Boolean(entry.edited)},
              ${entry.editNote || null},
              ${JSON.stringify(entry)}::jsonb,
              ${entry.createdAt || entry.clockInAt || new Date().toISOString()},
              ${entry.updatedAt || new Date().toISOString()}
            )
            on conflict (id) do nothing
          `;
        }
      }
    })();
  }

  await initPromise;
}

function normalizeEntry(raw: any): TimeEntry {
  const payload = typeof raw?.payload === "string"
    ? (() => {
        try {
          return JSON.parse(raw.payload);
        } catch {
          return {};
        }
      })()
    : raw?.payload || {};

  return {
    id: String(raw?.id ?? payload?.id ?? ""),
    techId: String(raw?.techId ?? raw?.tech_id ?? payload?.techId ?? ""),
    techName: raw?.techName ?? raw?.tech_name ?? payload?.techName ?? undefined,
    clockInAt: String(raw?.clockInAt ?? raw?.clock_in_at ?? payload?.clockInAt ?? ""),
    clockOutAt: raw?.clockOutAt ?? raw?.clock_out_at ?? payload?.clockOutAt ?? undefined,
    totalMinutes: Number(raw?.totalMinutes ?? raw?.total_minutes ?? payload?.totalMinutes ?? 0) || 0,
    status: (raw?.status ?? payload?.status ?? "open") as TimeEntry["status"],
    edited: Boolean(raw?.edited ?? payload?.edited),
    editNote: raw?.editNote ?? raw?.edit_note ?? payload?.editNote ?? undefined,
    createdAt: String(raw?.createdAt ?? raw?.created_at ?? payload?.createdAt ?? raw?.clock_in_at ?? new Date().toISOString()),
    updatedAt: String(raw?.updatedAt ?? raw?.updated_at ?? payload?.updatedAt ?? new Date().toISOString()),
  };
}

export async function listTimeEntries(filters?: { techId?: string; openOnly?: boolean; date?: string }) {
  const sql = getSql();
  if (!sql) {
    let entries = loadFileEntries();
    if (filters?.techId) entries = entries.filter((entry) => entry.techId === filters.techId);
    if (filters?.openOnly) entries = entries.filter((entry) => entry.status === "open");
    if (filters?.date) entries = entries.filter((entry) => entry.clockInAt.startsWith(filters.date!));
    return entries;
  }

  await ensureTable();
  const rows = await sql<{
    id: string;
    tech_id: string;
    tech_name: string | null;
    clock_in_at: string;
    clock_out_at: string | null;
    total_minutes: number | null;
    status: string;
    edited: boolean;
    edit_note: string | null;
    payload: any;
    created_at: string;
    updated_at: string;
  }[]>`
    select id, tech_id, tech_name, clock_in_at, clock_out_at, total_minutes, status, edited, edit_note, payload, created_at, updated_at
    from hearth_time_entries
    order by clock_in_at desc, updated_at desc
  `;
  let entries = rows.map((row) => normalizeEntry(row));
  if (filters?.techId) entries = entries.filter((entry) => entry.techId === filters.techId);
  if (filters?.openOnly) entries = entries.filter((entry) => entry.status === "open");
  if (filters?.date) entries = entries.filter((entry) => entry.clockInAt.startsWith(filters.date!));
  return entries;
}

export async function getOpenTimeEntry(techIds: string[]) {
  const candidates = techIds.filter(Boolean);
  if (candidates.length === 0) return null;
  const entries = await listTimeEntries({ openOnly: true });
  return entries.find((entry) => candidates.includes(entry.techId)) || null;
}

export async function createTimeEntry(input: { techId: string; techName?: string }) {
  const now = new Date().toISOString();
  const entry: TimeEntry = {
    id: `te-${Date.now()}`,
    techId: input.techId,
    techName: input.techName,
    clockInAt: now,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  const sql = getSql();
  if (!sql) {
    const entries = loadFileEntries();
    const open = entries.find((existing) => existing.techId === input.techId && existing.status === "open");
    if (open) return { entry: open, alreadyOpen: true };
    const next = [entry, ...entries];
    saveFileEntries(next);
    return { entry, alreadyOpen: false };
  }

  await ensureTable();
  const openRows = await sql<{ id: string; payload: any }[]>`
    select id, payload
    from hearth_time_entries
    where tech_id = ${input.techId}
      and status = 'open'
    order by clock_in_at desc
    limit 1
  `;
  if (openRows[0]) {
    return { entry: normalizeEntry(openRows[0]), alreadyOpen: true };
  }

  await sql`
    insert into hearth_time_entries (
      id, tech_id, tech_name, clock_in_at, clock_out_at, total_minutes, status, edited, edit_note, payload, created_at, updated_at
    ) values (
      ${entry.id},
      ${entry.techId},
      ${entry.techName || null},
      ${entry.clockInAt},
      ${null},
      ${null},
      ${entry.status},
      ${false},
      ${null},
      ${JSON.stringify(entry)}::jsonb,
      ${entry.createdAt},
      ${entry.updatedAt}
    )
  `;

  return { entry, alreadyOpen: false };
}

export async function closeOpenTimeEntry(techId: string) {
  const sql = getSql();
  if (!sql) {
    const entries = loadFileEntries();
    const index = entries.findIndex((entry) => entry.techId === techId && entry.status === "open");
    if (index === -1) return null;
    const now = new Date().toISOString();
    const totalMinutes = Math.max(0, Math.round((new Date(now).getTime() - new Date(entries[index].clockInAt).getTime()) / 60000));
    entries[index] = {
      ...entries[index],
      clockOutAt: now,
      totalMinutes,
      status: "closed",
      updatedAt: now,
    };
    saveFileEntries(entries);
    return entries[index];
  }

  await ensureTable();
  const rows = await sql<{
    id: string;
    tech_id: string;
    tech_name: string | null;
    clock_in_at: string;
    payload: any;
  }[]>`
    select id, tech_id, tech_name, clock_in_at, payload
    from hearth_time_entries
    where tech_id = ${techId}
      and status = 'open'
    order by clock_in_at desc
    limit 1
  `;
  if (!rows[0]) return null;

  const existing = normalizeEntry(rows[0]);
  const now = new Date().toISOString();
  const totalMinutes = Math.max(0, Math.round((new Date(now).getTime() - new Date(existing.clockInAt).getTime()) / 60000));
  const updated: TimeEntry = {
    ...existing,
    clockOutAt: now,
    totalMinutes,
    status: "closed",
    updatedAt: now,
  };

  await sql`
    update hearth_time_entries
    set
      tech_name = ${updated.techName || null},
      clock_out_at = ${updated.clockOutAt || null},
      total_minutes = ${updated.totalMinutes ?? null},
      status = ${updated.status},
      edited = ${Boolean(updated.edited)},
      edit_note = ${updated.editNote || null},
      payload = ${JSON.stringify(updated)}::jsonb,
      updated_at = ${updated.updatedAt}
    where id = ${updated.id}
  `;

  return updated;
}

export async function createManualTimeEntry(input: {
  techId: string;
  techName?: string;
  clockInAt: string;
  clockOutAt: string;
  editNote?: string;
}): Promise<TimeEntry> {
  const now = new Date().toISOString();
  const totalMinutes = Math.max(0, Math.round((new Date(input.clockOutAt).getTime() - new Date(input.clockInAt).getTime()) / 60000));
  const entry: TimeEntry = {
    id: `te-${Date.now()}-manual`,
    techId: input.techId,
    techName: input.techName,
    clockInAt: input.clockInAt,
    clockOutAt: input.clockOutAt,
    totalMinutes,
    status: "closed",
    edited: true,
    editNote: input.editNote || "Manual entry",
    createdAt: now,
    updatedAt: now,
  };

  const sql = getSql();
  if (!sql) {
    const entries = loadFileEntries();
    saveFileEntries([entry, ...entries]);
    return entry;
  }

  await ensureTable();
  await sql`
    INSERT INTO hearth_time_entries (
      id, tech_id, tech_name, clock_in_at, clock_out_at, total_minutes, status, edited, edit_note, payload, created_at, updated_at
    ) VALUES (
      ${entry.id}, ${entry.techId}, ${entry.techName || null},
      ${entry.clockInAt}, ${entry.clockOutAt || null}, ${entry.totalMinutes ?? null},
      ${entry.status}, ${true}, ${entry.editNote || null},
      ${JSON.stringify(entry)}::jsonb, ${entry.createdAt}, ${entry.updatedAt}
    )
  `;

  return entry;
}

export async function updateTimeEntry(input: {
  id: string;
  clockInAt?: string;
  clockOutAt?: string;
  editNote?: string;
}) {
  const sql = getSql();
  if (!sql) {
    const entries = loadFileEntries();
    const index = entries.findIndex((entry) => entry.id === input.id);
    if (index === -1) return null;
    const clockInAt = input.clockInAt || entries[index].clockInAt;
    const clockOutAt = input.clockOutAt ?? entries[index].clockOutAt;
    const status = clockOutAt ? "closed" : "open";
    const totalMinutes = clockOutAt
      ? Math.max(0, Math.round((new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / 60000))
      : entries[index].totalMinutes;
    entries[index] = {
      ...entries[index],
      clockInAt,
      clockOutAt,
      totalMinutes,
      status,
      edited: true,
      editNote: input.editNote || entries[index].editNote,
      updatedAt: new Date().toISOString(),
    };
    saveFileEntries(entries);
    return entries[index];
  }

  await ensureTable();
  const rows = await sql<{
    id: string;
    tech_id: string;
    tech_name: string | null;
    clock_in_at: string;
    clock_out_at: string | null;
    total_minutes: number | null;
    status: string;
    edited: boolean;
    edit_note: string | null;
    payload: any;
    created_at: string;
    updated_at: string;
  }[]>`
    select id, tech_id, tech_name, clock_in_at, clock_out_at, total_minutes, status, edited, edit_note, payload, created_at, updated_at
    from hearth_time_entries
    where id = ${input.id}
    limit 1
  `;
  if (!rows[0]) return null;

  const existing = normalizeEntry(rows[0]);
  const clockInAt = input.clockInAt || existing.clockInAt;
  const clockOutAt = input.clockOutAt ?? existing.clockOutAt;
  const status = clockOutAt ? "closed" : "open";
  const totalMinutes = clockOutAt
    ? Math.max(0, Math.round((new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / 60000))
    : existing.totalMinutes;
  const updated: TimeEntry = {
    ...existing,
    clockInAt,
    clockOutAt,
    totalMinutes,
    status,
    edited: true,
    editNote: input.editNote || existing.editNote,
    updatedAt: new Date().toISOString(),
  };

  await sql`
    update hearth_time_entries
    set
      clock_in_at = ${updated.clockInAt},
      clock_out_at = ${updated.clockOutAt || null},
      total_minutes = ${updated.totalMinutes ?? null},
      status = ${updated.status},
      edited = ${true},
      edit_note = ${updated.editNote || null},
      payload = ${JSON.stringify(updated)}::jsonb,
      updated_at = ${updated.updatedAt}
    where id = ${updated.id}
  `;

  // Don't re-snapshot all entries after every edit — it causes race conditions
  return updated;
}
