import postgres from "postgres";
import { readJsonFile, writeJsonFileWithBackup } from "@/lib/persist-json";
import { getJob, listJobs, type Job } from "@/lib/job-store";
import {
  isTenantStorageEnabled,
  requireTenantDatabase,
  resolveStorageOrgId,
} from "@/lib/tenant/storage";

export type MeeksWorkType = "install" | "setup" | "service_warranty" | "repair";
export type MeeksJobStatus = "requested" | "scheduled" | "completed" | "cancelled";

export interface MeeksAttachment {
  id: string;
  storageId?: string;
  fileName: string;
  contentType: string;
  size: number;
  dataUrl: string;
  uploadedAt: string;
}

export interface MeeksJobRequest {
  id: string;
  requestNumber: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  poNumber?: string;
  address: string;
  lotNumber?: string;
  city?: string;
  state?: string;
  zip?: string;
  workType: MeeksWorkType;
  appliance?: string;
  requestedDate: string;
  requestedTimeWindow?: string;
  priority: "normal" | "high" | "urgent";
  notes?: string;
  accessNotes?: string;
  poAttachment?: MeeksAttachment;
  status: MeeksJobStatus;
  linkedJobId?: string;
  linkedJobNumber?: string;
  scheduledDate?: string;
  scheduledTimeStart?: string;
  scheduledTimeEnd?: string;
  assignedTechs?: Array<{ id: string; name: string; color: string }>;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type EnrichedMeeksJobRequest = MeeksJobRequest & {
  linkedJob?: Pick<
    Job,
    | "id"
    | "jobNumber"
    | "status"
    | "notes"
    | "photos"
    | "completedAt"
    | "assignedTechs"
    | "scheduledDate"
    | "scheduledTimeStart"
    | "scheduledTimeEnd"
  > | null;
};

const MEEKS_FILE = "meeks-jobs.json";
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

function loadFileJobs() {
  return readJsonFile<MeeksJobRequest[]>(MEEKS_FILE, []);
}

function saveFileJobs(jobs: MeeksJobRequest[]) {
  writeJsonFileWithBackup(MEEKS_FILE, jobs);
}

async function ensureTable() {
  const sql = getSql();
  if (!sql) return;

  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        create table if not exists hearth_meeks_jobs_store (
          id text primary key,
          request_number text not null,
          requested_date date,
          status text not null,
          linked_job_id text,
          payload jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
      `;
      await sql`create index if not exists idx_hearth_meeks_jobs_requested on hearth_meeks_jobs_store (requested_date, status);`;
      await sql`create index if not exists idx_hearth_meeks_jobs_linked on hearth_meeks_jobs_store (linked_job_id);`;
      if (isTenantStorageEnabled()) {
        await sql`alter table hearth_meeks_jobs_store add column if not exists org_id uuid;`;
        await sql`create index if not exists idx_hearth_meeks_jobs_store_org_id on hearth_meeks_jobs_store (org_id);`;
      }

      const countRows = await sql<{ count: number }[]>`select count(*)::int as count from hearth_meeks_jobs_store`;
      if ((countRows[0]?.count || 0) === 0 && !isTenantStorageEnabled()) {
        for (const job of loadFileJobs()) {
          await sql`
            insert into hearth_meeks_jobs_store (id, request_number, requested_date, status, linked_job_id, payload, created_at, updated_at)
            values (
              ${job.id},
              ${job.requestNumber},
              ${job.requestedDate || null},
              ${job.status},
              ${job.linkedJobId || null},
              ${sql.json(job as any)},
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

function normalizeMeeksJob(raw: any): MeeksJobRequest {
  const payload = typeof raw?.payload === "string"
    ? (() => {
        try {
          return JSON.parse(raw.payload);
        } catch {
          return {};
        }
      })()
    : raw?.payload || raw || {};
  const now = new Date().toISOString();
  return {
    id: String(payload.id || raw?.id || crypto.randomUUID()),
    requestNumber: String(payload.requestNumber || raw?.request_number || ""),
    customerName: String(payload.customerName || ""),
    customerPhone: payload.customerPhone ? String(payload.customerPhone) : undefined,
    customerEmail: payload.customerEmail ? String(payload.customerEmail) : undefined,
    poNumber: payload.poNumber ? String(payload.poNumber) : undefined,
    address: String(payload.address || ""),
    lotNumber: payload.lotNumber ? String(payload.lotNumber) : undefined,
    city: payload.city ? String(payload.city) : undefined,
    state: payload.state ? String(payload.state) : undefined,
    zip: payload.zip ? String(payload.zip) : undefined,
    workType: (payload.workType || "install") as MeeksWorkType,
    appliance: payload.appliance ? String(payload.appliance) : undefined,
    requestedDate: String(payload.requestedDate || raw?.requested_date || new Date().toISOString().split("T")[0]),
    requestedTimeWindow: payload.requestedTimeWindow ? String(payload.requestedTimeWindow) : undefined,
    priority: (payload.priority || "normal") as MeeksJobRequest["priority"],
    notes: payload.notes ? String(payload.notes) : undefined,
    accessNotes: payload.accessNotes ? String(payload.accessNotes) : undefined,
    poAttachment: payload.poAttachment && typeof payload.poAttachment === "object"
      ? {
          id: String(payload.poAttachment.id || crypto.randomUUID()),
          storageId: payload.poAttachment.storageId ? String(payload.poAttachment.storageId) : undefined,
          fileName: String(payload.poAttachment.fileName || "PO attachment"),
          contentType: String(payload.poAttachment.contentType || "application/octet-stream"),
          size: Number(payload.poAttachment.size || 0),
          dataUrl: String(payload.poAttachment.dataUrl || ""),
          uploadedAt: String(payload.poAttachment.uploadedAt || now),
        }
      : undefined,
    status: (payload.status || raw?.status || "requested") as MeeksJobStatus,
    linkedJobId: payload.linkedJobId || raw?.linked_job_id ? String(payload.linkedJobId || raw?.linked_job_id) : undefined,
    linkedJobNumber: payload.linkedJobNumber ? String(payload.linkedJobNumber) : undefined,
    scheduledDate: payload.scheduledDate ? String(payload.scheduledDate) : undefined,
    scheduledTimeStart: payload.scheduledTimeStart ? String(payload.scheduledTimeStart).slice(0, 5) : undefined,
    scheduledTimeEnd: payload.scheduledTimeEnd ? String(payload.scheduledTimeEnd).slice(0, 5) : undefined,
    assignedTechs: Array.isArray(payload.assignedTechs) ? payload.assignedTechs : [],
    completedAt: payload.completedAt ? String(payload.completedAt) : undefined,
    createdAt: String(payload.createdAt || raw?.created_at || now),
    updatedAt: String(payload.updatedAt || raw?.updated_at || now),
  };
}

function nextRequestNumberFrom(jobs: MeeksJobRequest[]) {
  const max = jobs
    .map((job) => Number((job.requestNumber || "").split("-").pop() || 0))
    .filter((value) => !Number.isNaN(value))
    .reduce((highest, value) => Math.max(highest, value), 0);
  return `MEEKS-${new Date().getFullYear()}-${String(max + 1).padStart(4, "0")}`;
}

async function writeJob(job: MeeksJobRequest, explicitOrgId?: string) {
  const sql = getSql();
  requireTenantDatabase(Boolean(sql));
  if (!sql) {
    const jobs = loadFileJobs();
    const idx = jobs.findIndex((item) => item.id === job.id);
    if (idx === -1) jobs.unshift(job);
    else jobs[idx] = job;
    saveFileJobs(jobs);
    return job;
  }

  await ensureTable();
  const orgId = await resolveStorageOrgId(explicitOrgId);
  if (orgId) {
    await sql`
      insert into hearth_meeks_jobs_store (id, org_id, request_number, requested_date, status, linked_job_id, payload, created_at, updated_at)
      values (
        ${job.id}, ${orgId}, ${job.requestNumber}, ${job.requestedDate || null}, ${job.status},
        ${job.linkedJobId || null}, ${sql.json(job as any)}, ${job.createdAt}, ${job.updatedAt}
      )
      on conflict (id) do update set
        request_number = excluded.request_number, requested_date = excluded.requested_date,
        status = excluded.status, linked_job_id = excluded.linked_job_id,
        payload = excluded.payload, updated_at = excluded.updated_at
      where hearth_meeks_jobs_store.org_id = ${orgId}
    `;
    return job;
  }
  await sql`
    insert into hearth_meeks_jobs_store (id, request_number, requested_date, status, linked_job_id, payload, created_at, updated_at)
    values (
      ${job.id},
      ${job.requestNumber},
      ${job.requestedDate || null},
      ${job.status},
      ${job.linkedJobId || null},
      ${sql.json(job as any)},
      ${job.createdAt},
      ${job.updatedAt}
    )
    on conflict (id) do update set
      request_number = excluded.request_number,
      requested_date = excluded.requested_date,
      status = excluded.status,
      linked_job_id = excluded.linked_job_id,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `;
  return job;
}

export async function listMeeksJobs(explicitOrgId?: string): Promise<MeeksJobRequest[]> {
  const sql = getSql();
  requireTenantDatabase(Boolean(sql));
  if (!sql) {
    return loadFileJobs().map((job) => normalizeMeeksJob(job));
  }

  await ensureTable();
  const orgId = await resolveStorageOrgId(explicitOrgId);
  if (orgId) {
    const rows = await sql<Array<{ payload: MeeksJobRequest }>>`
      select payload from hearth_meeks_jobs_store
      where org_id = ${orgId}
      order by requested_date asc nulls last, created_at desc
    `;
    return rows.map((row) => normalizeMeeksJob(row));
  }
  const rows = await sql<Array<{ payload: MeeksJobRequest }>>`
    select payload
    from hearth_meeks_jobs_store
    order by requested_date asc nulls last, created_at desc
  `;
  return rows.map((row) => normalizeMeeksJob(row));
}

export async function listEnrichedMeeksJobs(explicitOrgId?: string): Promise<EnrichedMeeksJobRequest[]> {
  const [meeksJobs, hearthJobs] = await Promise.all([listMeeksJobs(explicitOrgId), listJobs(explicitOrgId)]);
  const byId = new Map(hearthJobs.map((job) => [job.id, job]));

  return meeksJobs.map((request) => {
    const linkedJob = request.linkedJobId ? byId.get(request.linkedJobId) || null : null;
    if (!linkedJob) return { ...request, linkedJob: null };
    const isComplete = linkedJob.status === "completed";
    return {
      ...request,
      status: isComplete ? "completed" : request.status,
      completedAt: linkedJob.completedAt || request.completedAt,
      scheduledDate: linkedJob.scheduledDate || request.scheduledDate,
      scheduledTimeStart: linkedJob.scheduledTimeStart || request.scheduledTimeStart,
      scheduledTimeEnd: linkedJob.scheduledTimeEnd || request.scheduledTimeEnd,
      assignedTechs: linkedJob.assignedTechs || request.assignedTechs,
      linkedJob: {
        id: linkedJob.id,
        jobNumber: linkedJob.jobNumber,
        status: linkedJob.status,
        notes: linkedJob.notes,
        photos: (linkedJob.photos || []).map((photo) => ({
          ...photo,
          uri: photo.uri?.startsWith('/api/files/')
            ? photo.uri.replace('/api/files/', '/api/meeks/attachments/')
            : photo.uri,
        })),
        completedAt: linkedJob.completedAt,
        assignedTechs: linkedJob.assignedTechs,
        scheduledDate: linkedJob.scheduledDate,
        scheduledTimeStart: linkedJob.scheduledTimeStart,
        scheduledTimeEnd: linkedJob.scheduledTimeEnd,
      },
    };
  });
}

export async function getMeeksJob(id: string, explicitOrgId?: string): Promise<MeeksJobRequest | null> {
  const jobs = await listMeeksJobs(explicitOrgId);
  return jobs.find((job) => job.id === id) || null;
}

export async function createMeeksJob(data: Partial<MeeksJobRequest>, explicitOrgId?: string): Promise<MeeksJobRequest> {
  const jobs = await listMeeksJobs(explicitOrgId);
  const now = new Date().toISOString();
  const job = normalizeMeeksJob({
    ...data,
    id: data.id || crypto.randomUUID(),
    requestNumber: data.requestNumber || nextRequestNumberFrom(jobs),
    status: data.status || "requested",
    priority: data.priority || "normal",
    createdAt: now,
    updatedAt: now,
  });
  return writeJob(job, explicitOrgId);
}

export async function updateMeeksJob(id: string, updates: Partial<MeeksJobRequest>, explicitOrgId?: string): Promise<MeeksJobRequest | null> {
  const current = await getMeeksJob(id, explicitOrgId);
  if (!current) return null;
  const next = normalizeMeeksJob({
    ...current,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  });
  return writeJob(next, explicitOrgId);
}

export async function deleteMeeksJob(id: string, explicitOrgId?: string): Promise<MeeksJobRequest | null> {
  const current = await getMeeksJob(id, explicitOrgId);
  if (!current) return null;

  const sql = getSql();
  requireTenantDatabase(Boolean(sql));
  if (!sql) {
    const jobs = loadFileJobs();
    const next = jobs.filter((job) => job.id !== id);
    saveFileJobs(next);
    return current;
  }

  await ensureTable();
  const orgId = await resolveStorageOrgId(explicitOrgId);
  if (orgId) await sql`delete from hearth_meeks_jobs_store where id = ${id} and org_id = ${orgId}`;
  else await sql`delete from hearth_meeks_jobs_store where id = ${id}`;
  return current;
}

export async function getLinkedJobForMeeksRequest(id: string, explicitOrgId?: string) {
  const request = await getMeeksJob(id, explicitOrgId);
  if (!request?.linkedJobId) return null;
  return getJob(request.linkedJobId, explicitOrgId);
}
