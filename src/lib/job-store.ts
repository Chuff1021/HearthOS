import postgres from "postgres";
import { readJsonFile, writeJsonFileWithBackup } from "@/lib/persist-json";

export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "on_hold";
export type JobPriority = "low" | "normal" | "high" | "urgent";
export type JobType = "cleaning" | "inspection" | "repair" | "installation" | "service" | "estimate";

export interface Job {
  id: string;
  jobNumber: string;
  title: string;
  customerId: string;
  customerName: string;
  propertyAddress: string;
  linkedInvoiceId?: string;
  linkedEstimateId?: string;
  linkedDocumentNumber?: string;
  fireplaceUnit?: {
    brand: string;
    model: string;
    nickname?: string;
    type?: string;
  };
  jobType: JobType;
  status: JobStatus;
  priority: JobPriority;
  scheduledDate: string;
  scheduledTimeStart: string;
  scheduledTimeEnd: string;
  assignedTechs: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  totalAmount: number;
  notes?: string;
  checklistItems?: Record<string, boolean>;
  checklistForm?: {
    templateId: string;
    values: Record<string, string | boolean>;
    customerName?: string;
    technicianName?: string;
    customerSignature?: string;
    signedAt?: string;
    updatedAt?: string;
  };
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  photos?: Array<{
    id: string;
    type?: string;
    label?: string;
    caption?: string;
    timestamp?: string;
    uri?: string;
    checklistItemId?: string;
  }>;
}

const JOBS_FILE = "jobs.json";
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

function loadFileJobs(): Job[] {
  return readJsonFile<Job[]>(JOBS_FILE, []);
}

function saveFileJobs(jobs: Job[]) {
  writeJsonFileWithBackup(JOBS_FILE, jobs);
}

async function ensureTable() {
  const sql = getSql();
  if (!sql) return;

  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        create table if not exists hearth_jobs_store (
          id text primary key,
          job_number text not null,
          scheduled_date date,
          scheduled_time_start time,
          status text not null,
          payload jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
      `;
      await sql`create index if not exists idx_hearth_jobs_store_sched on hearth_jobs_store (scheduled_date, scheduled_time_start);`;
      await sql`create index if not exists idx_hearth_jobs_store_status on hearth_jobs_store (status);`;

      const countRows = await sql<{ count: number }[]>`select count(*)::int as count from hearth_jobs_store`;
      const count = countRows[0]?.count || 0;
      if (count === 0) {
        const fileJobs = loadFileJobs();
        for (const job of fileJobs) {
          await sql`
            insert into hearth_jobs_store (id, job_number, scheduled_date, scheduled_time_start, status, payload, created_at, updated_at)
            values (
              ${job.id},
              ${job.jobNumber},
              ${job.scheduledDate || null},
              ${job.scheduledTimeStart || null},
              ${job.status},
              ${JSON.stringify(job)}::jsonb,
              ${job.createdAt || new Date().toISOString()},
              ${job.updatedAt || new Date().toISOString()}
            )
            on conflict (id) do nothing
          `;
        }
      }
    })();
  }

  await initPromise;
}

function normalizeJob(raw: any): Job {
  const payload = typeof raw?.payload === "string"
    ? (() => {
        try {
          return JSON.parse(raw.payload);
        } catch {
          return {};
        }
      })()
    : raw?.payload || {};
  const rawId = raw?.id ?? payload?.id;
  const rawJobNumber = raw?.jobNumber ?? raw?.job_number ?? payload?.jobNumber;
  const rawScheduledDate = raw?.scheduledDate ?? raw?.scheduled_date ?? payload?.scheduledDate;
  const rawScheduledTimeStart = raw?.scheduledTimeStart ?? raw?.scheduled_time_start ?? payload?.scheduledTimeStart;
  const rawStatus = raw?.status ?? payload?.status;
  const normalizedDate = typeof rawScheduledDate === "string"
    ? rawScheduledDate.includes("T")
      ? rawScheduledDate.split("T")[0]
      : rawScheduledDate
    : rawScheduledDate instanceof Date
      ? rawScheduledDate.toISOString().split("T")[0]
      : "";
  const normalizedStartTime = typeof rawScheduledTimeStart === "string"
    ? rawScheduledTimeStart.slice(0, 5)
    : rawScheduledTimeStart instanceof Date
      ? rawScheduledTimeStart.toISOString().slice(11, 16)
      : "09:00";
  const rawScheduledTimeEnd = raw?.scheduledTimeEnd ?? payload?.scheduledTimeEnd;
  const normalizedEndTime = typeof rawScheduledTimeEnd === "string"
    ? rawScheduledTimeEnd.slice(0, 5)
    : rawScheduledTimeEnd instanceof Date
      ? rawScheduledTimeEnd.toISOString().slice(11, 16)
      : "10:00";
  return {
    id: String(rawId || ""),
    jobNumber: String(rawJobNumber || ""),
    title: String(raw.title ?? payload?.title ?? "New Job"),
    customerId: String(raw.customerId ?? payload?.customerId ?? ""),
    customerName: String(raw.customerName ?? payload?.customerName ?? ""),
    propertyAddress: String(raw.propertyAddress ?? payload?.propertyAddress ?? ""),
    linkedInvoiceId: raw.linkedInvoiceId ?? payload?.linkedInvoiceId ?? undefined,
    linkedEstimateId: raw.linkedEstimateId ?? payload?.linkedEstimateId ?? undefined,
    linkedDocumentNumber: raw.linkedDocumentNumber ?? payload?.linkedDocumentNumber ?? undefined,
    fireplaceUnit: raw.fireplaceUnit || payload?.fireplaceUnit || undefined,
    jobType: (raw.jobType ?? payload?.jobType ?? "service") as JobType,
    status: (rawStatus || "scheduled") as JobStatus,
    priority: (raw.priority || "normal") as JobPriority,
    scheduledDate: normalizedDate,
    scheduledTimeStart: normalizedStartTime,
    scheduledTimeEnd: normalizedEndTime,
    assignedTechs: Array.isArray(raw.assignedTechs) ? raw.assignedTechs : Array.isArray(payload?.assignedTechs) ? payload.assignedTechs : [],
    totalAmount: Number(raw.totalAmount ?? payload?.totalAmount ?? 0),
    notes: raw.notes || payload?.notes ? String(raw.notes ?? payload?.notes) : undefined,
    checklistItems:
      raw.checklistItems && typeof raw.checklistItems === "object"
        ? raw.checklistItems
        : payload?.checklistItems && typeof payload.checklistItems === "object"
          ? payload.checklistItems
          : undefined,
    checklistForm:
      raw.checklistForm && typeof raw.checklistForm === "object"
        ? raw.checklistForm
        : payload?.checklistForm && typeof payload.checklistForm === "object"
          ? payload.checklistForm
          : undefined,
    completedAt: raw.completedAt || payload?.completedAt ? String(raw.completedAt ?? payload?.completedAt) : undefined,
    createdAt: String(raw.createdAt ?? raw?.created_at ?? payload?.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? raw?.updated_at ?? payload?.updatedAt ?? new Date().toISOString()),
    photos: Array.isArray(raw.photos) ? raw.photos : Array.isArray(payload?.photos) ? payload.photos : [],
  };
}

function isValidJob(job: Job) {
  return Boolean(
    job.id &&
    job.jobNumber &&
    job.title &&
    job.title.toLowerCase() !== "new job" &&
    job.customerName &&
    job.scheduledDate
  );
}

export async function listJobs(): Promise<Job[]> {
  const sql = getSql();
  if (!sql) {
    return loadFileJobs().map((job) => normalizeJob(job)).filter(isValidJob);
  }

  await ensureTable();
  const rows = await sql<Array<{ id: string; job_number: string; scheduled_date: string | null; scheduled_time_start: string | null; status: string; payload: Job }>>`
    select id, job_number, scheduled_date, scheduled_time_start, status, payload
    from hearth_jobs_store
    order by scheduled_date asc nulls last, scheduled_time_start asc nulls last, updated_at desc
  `;
  return rows
    .map((row) => normalizeJob({
      id: row.id,
      job_number: row.job_number,
      scheduled_date: row.scheduled_date,
      scheduled_time_start: row.scheduled_time_start,
      status: row.status,
      payload: row.payload,
    }))
    .filter(isValidJob);
}

export async function getJob(id: string): Promise<Job | null> {
  const sql = getSql();
  if (!sql) {
    return loadFileJobs().find((job) => job.id === id) || null;
  }

  await ensureTable();
  const rows = await sql<Array<{ id: string; job_number: string; scheduled_date: string | null; scheduled_time_start: string | null; status: string; payload: Job }>>`
    select id, job_number, scheduled_date, scheduled_time_start, status, payload
    from hearth_jobs_store
    where id = ${id}
    limit 1
  `;
  return rows[0]
    ? normalizeJob({
        id: rows[0].id,
        job_number: rows[0].job_number,
        scheduled_date: rows[0].scheduled_date,
        scheduled_time_start: rows[0].scheduled_time_start,
        status: rows[0].status,
        payload: rows[0].payload,
      })
    : null;
}

function nextJobNumberFrom(jobs: Job[]) {
  const max = jobs
    .map((job) => Number((job.jobNumber || "").split("-").pop() || 0))
    .filter((value) => !Number.isNaN(value))
    .reduce((highest, value) => Math.max(highest, value), 149);
  return `JOB-${new Date().getFullYear()}-${String(max + 1).padStart(4, "0")}`;
}

export async function createJobRecord(data: Partial<Job>): Promise<Job> {
  const existing = await listJobs();
  const now = new Date().toISOString();
  const job = normalizeJob({
    id: data.id || crypto.randomUUID(),
    jobNumber: data.jobNumber || nextJobNumberFrom(existing),
    title: data.title || "New Job",
    customerId: data.customerId || "",
    customerName: data.customerName || "",
    propertyAddress: data.propertyAddress || "",
    linkedInvoiceId: data.linkedInvoiceId,
    linkedEstimateId: data.linkedEstimateId,
    linkedDocumentNumber: data.linkedDocumentNumber,
    fireplaceUnit: data.fireplaceUnit,
    jobType: data.jobType || "service",
    status: data.status || "scheduled",
    priority: data.priority || "normal",
    scheduledDate: data.scheduledDate || new Date().toISOString().split("T")[0],
    scheduledTimeStart: data.scheduledTimeStart || "09:00",
    scheduledTimeEnd: data.scheduledTimeEnd || "10:00",
    assignedTechs: data.assignedTechs || [],
    totalAmount: data.totalAmount || 0,
    notes: data.notes,
    checklistItems: data.checklistItems,
    photos: data.photos || [],
    createdAt: now,
    updatedAt: now,
  });

  const sql = getSql();
  if (!sql) {
    const next = [job, ...existing];
    saveFileJobs(next);
    return job;
  }

  await ensureTable();
  await sql`
    insert into hearth_jobs_store (id, job_number, scheduled_date, scheduled_time_start, status, payload, created_at, updated_at)
    values (
      ${job.id},
      ${job.jobNumber},
      ${job.scheduledDate || null},
      ${job.scheduledTimeStart || null},
      ${job.status},
      ${JSON.stringify(job)}::jsonb,
      ${job.createdAt},
      ${job.updatedAt}
    )
  `;
  return job;
}

export async function updateJobRecord(id: string, updates: Partial<Job>): Promise<Job | null> {
  const current = await getJob(id);
  if (!current) return null;

  const next = normalizeJob({
    ...current,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  });

  const sql = getSql();
  if (!sql) {
    const jobs = loadFileJobs();
    const idx = jobs.findIndex((job) => job.id === id);
    if (idx === -1) return null;
    jobs[idx] = next;
    saveFileJobs(jobs);
    return next;
  }

  await ensureTable();
  await sql`
    update hearth_jobs_store
    set
      job_number = ${next.jobNumber},
      scheduled_date = ${next.scheduledDate || null},
      scheduled_time_start = ${next.scheduledTimeStart || null},
      status = ${next.status},
      payload = ${JSON.stringify(next)}::jsonb,
      updated_at = ${next.updatedAt}
    where id = ${id}
  `;
  return next;
}

export async function deleteJobRecord(id: string): Promise<boolean> {
  const sql = getSql();
  if (!sql) {
    const jobs = loadFileJobs();
    const idx = jobs.findIndex((job) => job.id === id);
    if (idx === -1) return false;
    jobs.splice(idx, 1);
    saveFileJobs(jobs);
    return true;
  }

  await ensureTable();
  const rows = await sql<{ id: string }[]>`delete from hearth_jobs_store where id = ${id} returning id`;
  return rows.length > 0;
}
