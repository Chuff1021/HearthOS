import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { customers, db } from "@/db";

export type OutreachOutcome =
  | "not_called"
  | "called"
  | "no_answer"
  | "left_message"
  | "texted"
  | "emailed"
  | "follow_up";

export type ServiceOutreachRecord = {
  id: string;
  orgId: string;
  customerId: string;
  outcome: OutreachOutcome;
  contactDate: string;
  note: string | null;
  needsFollowUp: boolean;
  followUpDate: string | null;
  createdBy: string | null;
  createdAt: string;
};

const OUTCOME_LABELS: Record<OutreachOutcome, string> = {
  not_called: "Not called",
  called: "Called",
  no_answer: "No answer",
  left_message: "Left voicemail",
  texted: "Texted",
  emailed: "Emailed",
  follow_up: "Follow-up needed",
};

const VALID_OUTCOMES = new Set(Object.keys(OUTCOME_LABELS));

let initPromise: Promise<void> | null = null;

async function rowsFrom<T>(query: any): Promise<T[]> {
  const result = await db.execute(query);
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return result as T[];
}

export function normalizeOutreachOutcome(value: unknown): OutreachOutcome {
  const outcome = String(value || "").trim().toLowerCase();
  return VALID_OUTCOMES.has(outcome) ? (outcome as OutreachOutcome) : "called";
}

export function outreachOutcomeLabel(outcome: OutreachOutcome) {
  return OUTCOME_LABELS[outcome] || "Called";
}

export async function ensureServiceOutreachTable() {
  if (!initPromise) {
    initPromise = (async () => {
      await db.execute(sql`
        create table if not exists service_marketing_outreach (
          id uuid primary key,
          org_id uuid not null,
          customer_id uuid not null,
          outcome text not null,
          contact_date date not null default current_date,
          note text,
          needs_follow_up boolean not null default false,
          follow_up_date date,
          created_by text,
          created_at timestamptz not null default now()
        )
      ` as any);
      await db.execute(sql`
        create index if not exists idx_service_marketing_outreach_customer
        on service_marketing_outreach (org_id, customer_id, created_at desc)
      ` as any);
      await db.execute(sql`
        create index if not exists idx_service_marketing_outreach_followup
        on service_marketing_outreach (org_id, needs_follow_up, follow_up_date)
      ` as any);
    })();
  }

  await initPromise;
}

function toRecord(row: any): ServiceOutreachRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    customerId: String(row.customer_id),
    outcome: normalizeOutreachOutcome(row.outcome),
    contactDate: String(row.contact_date || "").slice(0, 10),
    note: row.note ? String(row.note) : null,
    needsFollowUp: Boolean(row.needs_follow_up),
    followUpDate: row.follow_up_date ? String(row.follow_up_date).slice(0, 10) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

export async function listLatestServiceOutreach(orgId: string) {
  await ensureServiceOutreachTable();
  const rows = await rowsFrom<any>(sql`
    select distinct on (customer_id)
      id, org_id, customer_id, outcome, contact_date, note, needs_follow_up, follow_up_date, created_by, created_at
    from service_marketing_outreach
    where org_id = ${orgId}
    order by customer_id, created_at desc
  ` as any);

  const byCustomer = new Map<string, ServiceOutreachRecord>();
  for (const row of rows) {
    const record = toRecord(row);
    byCustomer.set(record.customerId, record);
  }
  return byCustomer;
}

export async function listServiceOutreachForCustomer(orgId: string, customerId: string, limit = 20) {
  await ensureServiceOutreachTable();
  const rows = await rowsFrom<any>(sql`
    select id, org_id, customer_id, outcome, contact_date, note, needs_follow_up, follow_up_date, created_by, created_at
    from service_marketing_outreach
    where org_id = ${orgId} and customer_id = ${customerId}
    order by created_at desc
    limit ${Math.max(1, Math.min(limit, 100))}
  ` as any);
  return rows.map(toRecord);
}

export async function createServiceOutreach(input: {
  orgId: string;
  customerId: string;
  outcome: OutreachOutcome;
  contactDate: string;
  note?: string | null;
  needsFollowUp?: boolean;
  followUpDate?: string | null;
  createdBy?: string | null;
}) {
  await ensureServiceOutreachTable();

  const id = randomUUID();
  const cleanNote = String(input.note || "").trim() || null;
  const contactDate = input.contactDate || new Date().toISOString().slice(0, 10);
  const needsFollowUp = Boolean(input.needsFollowUp);
  const followUpDate = input.followUpDate || null;

  const rows = await rowsFrom<any>(sql`
    insert into service_marketing_outreach (
      id, org_id, customer_id, outcome, contact_date, note, needs_follow_up, follow_up_date, created_by
    )
    values (
      ${id}, ${input.orgId}, ${input.customerId}, ${input.outcome}, ${contactDate},
      ${cleanNote}, ${needsFollowUp}, ${followUpDate}, ${input.createdBy || null}
    )
    returning id, org_id, customer_id, outcome, contact_date, note, needs_follow_up, follow_up_date, created_by, created_at
  ` as any);

  const label = outreachOutcomeLabel(input.outcome);
  const noteParts = [
    `[Service outreach ${contactDate}] ${label}`,
    cleanNote,
    needsFollowUp ? `Follow up${followUpDate ? ` ${followUpDate}` : ""}` : null,
  ].filter(Boolean);
  const customerNote = noteParts.join(" - ");

  await db.execute(sql`
    update customers
    set
      notes = case
        when notes is null or btrim(notes) = '' then ${customerNote}
        else notes || E'\n' || ${customerNote}
      end,
      updated_at = now()
    where org_id = ${input.orgId} and id = ${input.customerId}
  ` as any);

  return toRecord(rows[0]);
}
