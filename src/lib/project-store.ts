import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { createJobRecord } from "@/lib/job-store";

export type ProjectSourceType = "estimate" | "invoice";
export type ProjectStage =
  | "new"
  | "parts_needed"
  | "parts_ordered"
  | "ready"
  | "scheduled"
  | "in_progress"
  | "complete";
export type ProjectPartsStatus =
  | "not_ordered"
  | "quote_requested"
  | "ordered"
  | "partial"
  | "received"
  | "backordered";

export type ProjectPart = {
  id: string;
  itemId?: string | null;
  sku?: string | null;
  name?: string | null;
  description: string;
  quantity: number;
  sourceLineId?: string | null;
};

export type ProjectRecord = {
  id: string;
  orgId: string;
  sourceType: ProjectSourceType;
  sourceId: string;
  sourceNumber: string | null;
  sourceUrl: string;
  customerId: string | null;
  customerName: string;
  title: string;
  stage: ProjectStage;
  priority: "low" | "normal" | "high" | "urgent";
  totalAmount: number;
  targetDate: string | null;
  scheduledJobId: string | null;
  partsStatus: ProjectPartsStatus;
  partsOrderedAt: string | null;
  partsExpectedAt: string | null;
  partsReceivedAt: string | null;
  poNumber: string | null;
  notes: string | null;
  parts: ProjectPart[];
  createdAt: string;
  updatedAt: string;
};

const STAGES = new Set<ProjectStage>(["new", "parts_needed", "parts_ordered", "ready", "scheduled", "in_progress", "complete"]);
const PARTS_STATUSES = new Set<ProjectPartsStatus>(["not_ordered", "quote_requested", "ordered", "partial", "received", "backordered"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

let initPromise: Promise<void> | null = null;

async function rowsFrom<T>(query: any): Promise<T[]> {
  const result = await db.execute(query);
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return result as T[];
}

export async function ensureProjectsTable() {
  if (!initPromise) {
    initPromise = (async () => {
      await db.execute(sql`
        create table if not exists hearth_projects (
          id uuid primary key,
          org_id uuid not null,
          source_type text not null,
          source_id text not null,
          source_number text,
          source_url text not null,
          customer_id text,
          customer_name text not null,
          title text not null,
          stage text not null default 'new',
          priority text not null default 'normal',
          total_amount numeric(12, 2) not null default 0,
          target_date date,
          scheduled_job_id text,
          parts_status text not null default 'not_ordered',
          parts_ordered_at date,
          parts_expected_at date,
          parts_received_at date,
          po_number text,
          notes text,
          payload jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (org_id, source_type, source_id)
        )
      ` as any);
      await db.execute(sql`
        create index if not exists idx_hearth_projects_stage
        on hearth_projects (org_id, stage, updated_at desc)
      ` as any);
      await db.execute(sql`
        create index if not exists idx_hearth_projects_parts_status
        on hearth_projects (org_id, parts_status, parts_expected_at)
      ` as any);
    })();
  }

  await initPromise;
}

function cleanDate(value: unknown) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeStage(value: unknown): ProjectStage {
  const stage = String(value || "").trim().toLowerCase() as ProjectStage;
  return STAGES.has(stage) ? stage : "new";
}

function normalizePartsStatus(value: unknown): ProjectPartsStatus {
  const status = String(value || "").trim().toLowerCase() as ProjectPartsStatus;
  return PARTS_STATUSES.has(status) ? status : "not_ordered";
}

function normalizePriority(value: unknown): ProjectRecord["priority"] {
  const priority = String(value || "").trim().toLowerCase();
  return PRIORITIES.has(priority) ? (priority as ProjectRecord["priority"]) : "normal";
}

function iso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function toProject(row: any): ProjectRecord {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    sourceType: row.source_type === "invoice" ? "invoice" : "estimate",
    sourceId: String(row.source_id),
    sourceNumber: row.source_number ? String(row.source_number) : null,
    sourceUrl: String(row.source_url || "#"),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerName: String(row.customer_name || "Customer"),
    title: String(row.title || "Project"),
    stage: normalizeStage(row.stage),
    priority: normalizePriority(row.priority),
    totalAmount: Number(row.total_amount || 0),
    targetDate: row.target_date ? String(row.target_date).slice(0, 10) : null,
    scheduledJobId: row.scheduled_job_id ? String(row.scheduled_job_id) : null,
    partsStatus: normalizePartsStatus(row.parts_status),
    partsOrderedAt: row.parts_ordered_at ? String(row.parts_ordered_at).slice(0, 10) : null,
    partsExpectedAt: row.parts_expected_at ? String(row.parts_expected_at).slice(0, 10) : null,
    partsReceivedAt: row.parts_received_at ? String(row.parts_received_at).slice(0, 10) : null,
    poNumber: row.po_number ? String(row.po_number) : null,
    notes: row.notes ? String(row.notes) : null,
    parts: parts.map((part: any, index: number) => ({
      id: String(part.id || `part-${index + 1}`),
      itemId: part.itemId || null,
      sku: part.sku || null,
      name: part.name || null,
      description: String(part.description || part.name || "Required part"),
      quantity: Number(part.quantity || 1),
      sourceLineId: part.sourceLineId || null,
    })),
    createdAt: iso(row.created_at) || new Date().toISOString(),
    updatedAt: iso(row.updated_at) || new Date().toISOString(),
  };
}

function titleFromLines(customerName: string, sourceLabel: string, lines: ProjectPart[]) {
  const first = lines.map((line) => line.description.trim()).find(Boolean);
  return first ? `${customerName} - ${first}` : `${customerName} - ${sourceLabel}`;
}

async function getInvoiceSource(orgId: string, sourceId: string) {
  const rows = await rowsFrom<any>(sql`
    select
      i.id::text as local_id,
      coalesce(i.qb_invoice_id, i.id::text) as source_id,
      i.invoice_number as source_number,
      i.customer_id::text as customer_id,
      coalesce(c.company_name, nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), 'Customer') as customer_name,
      i.total_amount,
      i.issue_date,
      i.notes
    from invoices i
    left join customers c on c.id = i.customer_id
    where i.org_id = ${orgId}
      and (i.id::text = ${sourceId} or i.qb_invoice_id = ${sourceId} or i.invoice_number = ${sourceId})
    limit 1
  ` as any);

  const header = rows[0];
  if (!header) return null;

  const lineRows = await rowsFrom<any>(sql`
    select
      li.id::text as id,
      li.qb_item_id as item_id,
      li.description,
      li.quantity,
      inv.sku,
      inv.name
    from invoice_line_items li
    left join inventory_items inv on inv.org_id = ${orgId} and inv.qb_item_id = li.qb_item_id
    where li.invoice_id = ${header.local_id}::uuid
    order by li."order" asc
  ` as any);

  const parts: ProjectPart[] = lineRows.map((line, index) => ({
    id: randomUUID(),
    itemId: line.item_id || null,
    sku: line.sku || null,
    name: line.name || null,
    description: String(line.description || line.name || line.sku || `Invoice line ${index + 1}`),
    quantity: Number(line.quantity || 1),
    sourceLineId: line.id || null,
  }));

  const sourceNumber = String(header.source_number || header.source_id);
  return {
    sourceType: "invoice" as const,
    sourceId: String(header.source_id),
    sourceNumber,
    sourceUrl: `/invoices?id=${encodeURIComponent(String(header.source_id))}`,
    customerId: header.customer_id ? String(header.customer_id) : null,
    customerName: String(header.customer_name || "Customer"),
    title: titleFromLines(String(header.customer_name || "Customer"), `Invoice ${sourceNumber}`, parts),
    totalAmount: Number(header.total_amount || 0),
    notes: header.notes ? String(header.notes) : null,
    parts,
  };
}

async function getEstimateSource(orgId: string, sourceId: string) {
  const rows = await rowsFrom<any>(sql`
    select
      e.id::text as local_id,
      coalesce(e.qb_estimate_id, e.id::text) as source_id,
      coalesce(e.estimate_number, e.qb_estimate_id, e.id::text) as source_number,
      e.customer_id::text as customer_id,
      coalesce(c.company_name, nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), 'Customer') as customer_name,
      e.total_amount,
      e.issue_date,
      e.private_note
    from estimates e
    left join customers c on c.id = e.customer_id
    where e.org_id = ${orgId}
      and (e.id::text = ${sourceId} or e.qb_estimate_id = ${sourceId} or e.estimate_number = ${sourceId})
    limit 1
  ` as any);

  const header = rows[0];
  if (!header) return null;

  const lineRows = await rowsFrom<any>(sql`
    select
      li.id::text as id,
      li.qb_item_id as item_id,
      li.description,
      li.quantity,
      inv.sku,
      inv.name
    from estimate_line_items li
    left join inventory_items inv on inv.org_id = ${orgId} and inv.qb_item_id = li.qb_item_id
    where li.estimate_id = ${header.local_id}::uuid
    order by li."order" asc
  ` as any);

  const parts: ProjectPart[] = lineRows.map((line, index) => ({
    id: randomUUID(),
    itemId: line.item_id || null,
    sku: line.sku || null,
    name: line.name || null,
    description: String(line.description || line.name || line.sku || `Estimate line ${index + 1}`),
    quantity: Number(line.quantity || 1),
    sourceLineId: line.id || null,
  }));

  const sourceNumber = String(header.source_number || header.source_id);
  return {
    sourceType: "estimate" as const,
    sourceId: String(header.source_id),
    sourceNumber,
    sourceUrl: `/estimates?id=${encodeURIComponent(String(header.source_id))}`,
    customerId: header.customer_id ? String(header.customer_id) : null,
    customerName: String(header.customer_name || "Customer"),
    title: titleFromLines(String(header.customer_name || "Customer"), `Estimate ${sourceNumber}`, parts),
    totalAmount: Number(header.total_amount || 0),
    notes: header.private_note ? String(header.private_note) : null,
    parts,
  };
}

export async function listProjects(orgId: string) {
  await ensureProjectsTable();
  const rows = await rowsFrom<any>(sql`
    select *
    from hearth_projects
    where org_id = ${orgId}
    order by
      case stage
        when 'new' then 1
        when 'parts_needed' then 2
        when 'parts_ordered' then 3
        when 'ready' then 4
        when 'scheduled' then 5
        when 'in_progress' then 6
        else 7
      end,
      target_date asc nulls last,
      updated_at desc
  ` as any);
  return rows.map(toProject);
}

export async function importProjectFromSource(orgId: string, sourceType: ProjectSourceType, sourceId: string) {
  await ensureProjectsTable();
  const source =
    sourceType === "invoice"
      ? await getInvoiceSource(orgId, sourceId)
      : await getEstimateSource(orgId, sourceId);

  if (!source) return null;

  const stage: ProjectStage = source.parts.length ? "parts_needed" : "new";
  const id = randomUUID();
  const payload = { parts: source.parts };

  const rows = await rowsFrom<any>(sql`
    insert into hearth_projects (
      id, org_id, source_type, source_id, source_number, source_url,
      customer_id, customer_name, title, stage, priority, total_amount,
      parts_status, notes, payload
    )
    values (
      ${id}, ${orgId}, ${source.sourceType}, ${source.sourceId}, ${source.sourceNumber}, ${source.sourceUrl},
      ${source.customerId}, ${source.customerName}, ${source.title}, ${stage}, 'normal', ${source.totalAmount},
      'not_ordered', ${source.notes}, ${JSON.stringify(payload)}::jsonb
    )
    on conflict (org_id, source_type, source_id)
    do update set
      source_number = excluded.source_number,
      source_url = excluded.source_url,
      customer_id = excluded.customer_id,
      customer_name = excluded.customer_name,
      title = case when hearth_projects.title = '' then excluded.title else hearth_projects.title end,
      total_amount = excluded.total_amount,
      payload = case
        when hearth_projects.payload = '{}'::jsonb then excluded.payload
        else hearth_projects.payload
      end,
      updated_at = now()
    returning *
  ` as any);

  return rows[0] ? toProject(rows[0]) : null;
}

export async function updateProject(orgId: string, id: string, updates: Record<string, unknown>) {
  await ensureProjectsTable();
  const currentRows = await rowsFrom<any>(sql`
    select * from hearth_projects where org_id = ${orgId} and id = ${id}::uuid limit 1
  ` as any);
  if (!currentRows[0]) return null;

  const current = toProject(currentRows[0]);
  const next = {
    title: String(updates.title ?? current.title).slice(0, 500),
    stage: normalizeStage(updates.stage ?? current.stage),
    priority: normalizePriority(updates.priority ?? current.priority),
    targetDate: cleanDate(updates.targetDate) || null,
    partsStatus: normalizePartsStatus(updates.partsStatus ?? current.partsStatus),
    partsOrderedAt: cleanDate(updates.partsOrderedAt) || null,
    partsExpectedAt: cleanDate(updates.partsExpectedAt) || null,
    partsReceivedAt: cleanDate(updates.partsReceivedAt) || null,
    poNumber: String(updates.poNumber ?? current.poNumber ?? "").slice(0, 120) || null,
    notes: String(updates.notes ?? current.notes ?? "").slice(0, 4000) || null,
  };

  const rows = await rowsFrom<any>(sql`
    update hearth_projects
    set
      title = ${next.title},
      stage = ${next.stage},
      priority = ${next.priority},
      target_date = ${next.targetDate},
      parts_status = ${next.partsStatus},
      parts_ordered_at = ${next.partsOrderedAt},
      parts_expected_at = ${next.partsExpectedAt},
      parts_received_at = ${next.partsReceivedAt},
      po_number = ${next.poNumber},
      notes = ${next.notes},
      updated_at = now()
    where org_id = ${orgId} and id = ${id}::uuid
    returning *
  ` as any);

  return rows[0] ? toProject(rows[0]) : null;
}

export async function createJobFromProject(orgId: string, id: string, input: { scheduledDate?: string; scheduledTimeStart?: string; scheduledTimeEnd?: string }) {
  await ensureProjectsTable();
  const rows = await rowsFrom<any>(sql`
    select * from hearth_projects where org_id = ${orgId} and id = ${id}::uuid limit 1
  ` as any);
  if (!rows[0]) return null;
  const project = toProject(rows[0]);

  const job = await createJobRecord({
    title: project.title,
    customerId: project.customerId || "",
    customerName: project.customerName,
    propertyAddress: "",
    linkedInvoiceId: project.sourceType === "invoice" ? project.sourceId : undefined,
    linkedEstimateId: project.sourceType === "estimate" ? project.sourceId : undefined,
    linkedDocumentNumber: project.sourceNumber || undefined,
    jobType: "installation",
    status: "scheduled",
    priority: project.priority,
    scheduledDate: cleanDate(input.scheduledDate) || project.targetDate || new Date().toISOString().slice(0, 10),
    scheduledTimeStart: String(input.scheduledTimeStart || "09:00").slice(0, 5),
    scheduledTimeEnd: String(input.scheduledTimeEnd || "12:00").slice(0, 5),
    totalAmount: project.totalAmount,
    notes: [
      `Created from ${project.sourceType} ${project.sourceNumber || project.sourceId}`,
      project.poNumber ? `PO: ${project.poNumber}` : null,
      project.partsStatus ? `Parts: ${project.partsStatus}` : null,
      project.notes,
    ].filter(Boolean).join("\n"),
  });

  const updated = await rowsFrom<any>(sql`
    update hearth_projects
    set stage = 'scheduled', scheduled_job_id = ${job.id}, updated_at = now()
    where org_id = ${orgId} and id = ${id}::uuid
    returning *
  ` as any);

  return { project: updated[0] ? toProject(updated[0]) : project, job };
}

export async function deleteProject(orgId: string, id: string) {
  await ensureProjectsTable();
  const rows = await rowsFrom<any>(sql`
    delete from hearth_projects
    where org_id = ${orgId} and id = ${id}::uuid
    returning id
  ` as any);
  return rows.length > 0;
}
