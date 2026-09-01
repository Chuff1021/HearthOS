import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import postgres from "postgres";
import { getOrCreateDefaultOrg } from "@/lib/org";

export type ExpenseAllocation = "customer" | "stock_shop";
export type ExpenseStatus = "submitted" | "approved" | "reimbursed" | "rejected";

export type ExpenseRecord = {
  id: string;
  orgId: string;
  submittedByClerkUserId: string;
  submittedByTechId: string | null;
  submittedByName: string;
  submittedByEmail: string | null;
  expenseDate: string;
  merchant: string;
  amount: number;
  category: string;
  allocationType: ExpenseAllocation;
  customerId: string | null;
  customerName: string | null;
  notes: string | null;
  status: ExpenseStatus;
  receiptObjectKey: string;
  receiptFileName: string;
  receiptContentType: string;
  receiptByteSize: number;
  receiptChecksum: string;
  receiptEtag: string | null;
  reviewedByClerkUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseActor = {
  clerkUserId: string;
  techId: string | null;
  name: string;
  email: string | null;
  isOffice: boolean;
};

let sqlClient: ReturnType<typeof postgres> | null = null;
let initPromise: Promise<void> | null = null;

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || null;
}

function getSql() {
  const url = getDatabaseUrl();
  if (!url) throw new Error("Neon database storage is required for expenses.");
  if (!sqlClient) {
    sqlClient = postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10, prepare: false });
  }
  return sqlClient;
}

async function ensureExpenseTable() {
  if (!initPromise) {
    initPromise = (async () => {
      const sql = getSql();
      await sql`
        create table if not exists hearth_expenses (
          id uuid primary key,
          org_id uuid not null references organizations(id) on delete cascade,
          submitted_by_clerk_user_id text not null,
          submitted_by_tech_id text,
          submitted_by_name text not null,
          submitted_by_email text,
          expense_date date not null,
          merchant text not null,
          amount numeric(12, 2) not null check (amount > 0),
          category varchar(60) not null,
          allocation_type varchar(20) not null check (allocation_type in ('customer', 'stock_shop')),
          customer_id text,
          customer_name text,
          notes text,
          status varchar(20) not null default 'submitted' check (status in ('submitted', 'approved', 'reimbursed', 'rejected')),
          receipt_object_key text not null unique,
          receipt_file_name text not null,
          receipt_content_type varchar(120) not null,
          receipt_byte_size integer not null,
          receipt_checksum varchar(64) not null,
          receipt_etag text,
          reviewed_by_clerk_user_id text,
          reviewed_by_name text,
          reviewed_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint hearth_expenses_customer_allocation check (
            (allocation_type = 'stock_shop' and customer_id is null and customer_name is null)
            or (allocation_type = 'customer' and customer_id is not null and customer_name is not null)
          )
        )
      `;
      await sql`create index if not exists hearth_expenses_org_created_idx on hearth_expenses (org_id, created_at desc)`;
      await sql`create index if not exists hearth_expenses_org_status_idx on hearth_expenses (org_id, status, expense_date desc)`;
      await sql`create index if not exists hearth_expenses_submitter_idx on hearth_expenses (org_id, submitted_by_clerk_user_id, created_at desc)`;
      await sql`create index if not exists hearth_expenses_customer_idx on hearth_expenses (org_id, customer_id, expense_date desc)`;
    })();
  }
  return initPromise;
}

function isUuid(value: string | null | undefined) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

export async function requireExpenseActor(): Promise<ExpenseActor> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return { clerkUserId: "local-admin", techId: null, name: "Local Admin", email: null, isOffice: true };
  }

  const session = await auth();
  if (!session.userId) throw new Error("UNAUTHORIZED");

  const client = await clerkClient();
  const user = await client.users.getUser(session.userId);
  const email = user.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || null;
  const metadataRole = String(
    user.publicMetadata?.hearthRole ||
    user.privateMetadata?.hearthRole ||
    user.unsafeMetadata?.hearthRole ||
    "",
  ).toLowerCase();
  const metadataTechId = String(user.unsafeMetadata?.techId || "").trim() || null;
  const name = user.fullName || user.firstName || user.username || email || "HearthOS User";

  let dbRole = "";
  let isOwner = false;
  let techId = metadataTechId;
  if (email || isUuid(metadataTechId)) {
    const sql = getSql();
    const org = await getOrCreateDefaultOrg();
    const rows = await sql<{ id: string; role: string; is_owner: boolean }[]>`
      select id::text, role::text, coalesce(is_owner, false) as is_owner
      from users
      where org_id = ${org.id}
        and (${email}::text is not null and lower(email) = ${email || ""} or ${isUuid(metadataTechId)} and id::text = ${metadataTechId || ""})
      limit 1
    `;
    if (rows[0]) {
      techId = rows[0].id;
      dbRole = rows[0].role;
      isOwner = rows[0].is_owner;
    }
  }

  return {
    clerkUserId: session.userId,
    techId,
    name,
    email,
    isOffice: isOwner || ["admin", "dispatcher", "owner"].includes(metadataRole) || ["admin", "dispatcher"].includes(dbRole),
  };
}

function mapExpense(row: Record<string, unknown>): ExpenseRecord {
  const dateValue = row.expense_date;
  const expenseDate = dateValue instanceof Date ? dateValue.toISOString().slice(0, 10) : String(dateValue || "").slice(0, 10);
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    submittedByClerkUserId: String(row.submitted_by_clerk_user_id),
    submittedByTechId: row.submitted_by_tech_id ? String(row.submitted_by_tech_id) : null,
    submittedByName: String(row.submitted_by_name),
    submittedByEmail: row.submitted_by_email ? String(row.submitted_by_email) : null,
    expenseDate,
    merchant: String(row.merchant),
    amount: Number(row.amount || 0),
    category: String(row.category),
    allocationType: String(row.allocation_type) as ExpenseAllocation,
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerName: row.customer_name ? String(row.customer_name) : null,
    notes: row.notes ? String(row.notes) : null,
    status: String(row.status) as ExpenseStatus,
    receiptObjectKey: String(row.receipt_object_key),
    receiptFileName: String(row.receipt_file_name),
    receiptContentType: String(row.receipt_content_type),
    receiptByteSize: Number(row.receipt_byte_size || 0),
    receiptChecksum: String(row.receipt_checksum),
    receiptEtag: row.receipt_etag ? String(row.receipt_etag) : null,
    reviewedByClerkUserId: row.reviewed_by_clerk_user_id ? String(row.reviewed_by_clerk_user_id) : null,
    reviewedByName: row.reviewed_by_name ? String(row.reviewed_by_name) : null,
    reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function createExpense(input: {
  id: string;
  orgId: string;
  actor: ExpenseActor;
  expenseDate: string;
  merchant: string;
  amount: number;
  category: string;
  allocationType: ExpenseAllocation;
  customerId: string | null;
  customerName: string | null;
  notes: string | null;
  receipt: {
    objectKey: string;
    fileName: string;
    contentType: string;
    byteSize: number;
    checksum: string;
    etag: string | null;
  };
}) {
  await ensureExpenseTable();
  const sql = getSql();
  const rows = await sql`
    insert into hearth_expenses (
      id, org_id, submitted_by_clerk_user_id, submitted_by_tech_id,
      submitted_by_name, submitted_by_email, expense_date, merchant, amount,
      category, allocation_type, customer_id, customer_name, notes,
      receipt_object_key, receipt_file_name, receipt_content_type,
      receipt_byte_size, receipt_checksum, receipt_etag
    ) values (
      ${input.id}, ${input.orgId}, ${input.actor.clerkUserId}, ${input.actor.techId},
      ${input.actor.name}, ${input.actor.email}, ${input.expenseDate}, ${input.merchant},
      ${input.amount}, ${input.category}, ${input.allocationType}, ${input.customerId},
      ${input.customerName}, ${input.notes}, ${input.receipt.objectKey},
      ${input.receipt.fileName}, ${input.receipt.contentType}, ${input.receipt.byteSize},
      ${input.receipt.checksum}, ${input.receipt.etag}
    ) returning *
  `;
  return mapExpense(rows[0]);
}

export async function listExpenses(input: {
  orgId: string;
  actor: ExpenseActor;
  mineOnly: boolean;
  status?: string | null;
  allocation?: string | null;
  query?: string | null;
}) {
  await ensureExpenseTable();
  const sql = getSql();
  const query = `%${(input.query || "").trim().toLowerCase()}%`;
  const rows = await sql`
    select * from hearth_expenses
    where org_id = ${input.orgId}
      and (${input.mineOnly} = false or submitted_by_clerk_user_id = ${input.actor.clerkUserId})
      and (${input.status || null}::text is null or status = ${input.status || null})
      and (${input.allocation || null}::text is null or allocation_type = ${input.allocation || null})
      and (${input.query?.trim() || null}::text is null or (
        lower(merchant) like ${query}
        or lower(submitted_by_name) like ${query}
        or lower(coalesce(customer_name, '')) like ${query}
        or lower(category) like ${query}
      ))
    order by expense_date desc, created_at desc
    limit 500
  `;
  return rows.map((row) => mapExpense(row));
}

export async function getExpense(orgId: string, id: string) {
  await ensureExpenseTable();
  const sql = getSql();
  const rows = await sql`select * from hearth_expenses where org_id = ${orgId} and id = ${id} limit 1`;
  return rows[0] ? mapExpense(rows[0]) : null;
}

export async function updateExpenseStatus(input: {
  orgId: string;
  id: string;
  status: ExpenseStatus;
  actor: ExpenseActor;
}) {
  await ensureExpenseTable();
  const sql = getSql();
  const rows = await sql`
    update hearth_expenses set
      status = ${input.status},
      reviewed_by_clerk_user_id = ${input.actor.clerkUserId},
      reviewed_by_name = ${input.actor.name},
      reviewed_at = now(),
      updated_at = now()
    where org_id = ${input.orgId} and id = ${input.id}
    returning *
  `;
  return rows[0] ? mapExpense(rows[0]) : null;
}
