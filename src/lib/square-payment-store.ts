import postgres from 'postgres';
import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';
import { isTenantStorageEnabled, resolveStorageOrgId } from '@/lib/tenant/storage';

export type StoredSquarePayment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  customerName?: string;
  invoiceNumber?: string;
  sourceType?: string;
  orderId?: string;
  receiptUrl?: string;
  createdAt: string;
  updatedAt: string;
  raw?: unknown;
};

const FILE = 'square-payments.json';

type SquarePaymentScope = string | { orgId: string; trustedSystem: true };

async function scopedOrgId(scope?: SquarePaymentScope) {
  if (typeof scope === 'object' && scope.trustedSystem) return scope.orgId;
  return resolveStorageOrgId(typeof scope === 'string' ? scope : undefined);
}

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('Tenant Square payments require DATABASE_URL.');
  return postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
}

function mapRow(row: any): StoredSquarePayment {
  return {
    id: row.square_payment_id,
    status: row.status,
    amount: Number(row.amount || 0),
    currency: row.currency || 'USD',
    customerName: row.customer_name || undefined,
    invoiceNumber: row.invoice_number || undefined,
    sourceType: row.source_type || undefined,
    orderId: row.order_id || undefined,
    receiptUrl: row.receipt_url || undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    raw: row.raw ?? undefined,
  };
}

export async function listSquarePayments(scope?: SquarePaymentScope): Promise<StoredSquarePayment[]> {
  if (!isTenantStorageEnabled()) return readJsonFile<StoredSquarePayment[]>(FILE, []);
  const orgId = await scopedOrgId(scope);
  const sql = getSql();
  try {
    const rows = await sql`
      select * from tenant_square_payments
      where org_id = ${orgId!}
      order by created_at desc
      limit 1000
    `;
    return rows.map(mapRow);
  } finally {
    await sql.end();
  }
}

export async function upsertSquarePayment(payment: StoredSquarePayment, scope?: SquarePaymentScope) {
  if (!isTenantStorageEnabled()) {
    const list = readJsonFile<StoredSquarePayment[]>(FILE, []);
    const idx = list.findIndex((p) => p.id === payment.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...payment, updatedAt: new Date().toISOString() };
    else list.unshift(payment);
    writeJsonFileWithBackup(FILE, list.slice(0, 1000));
    return;
  }

  const orgId = await scopedOrgId(scope);
  const sql = getSql();
  try {
    await sql`
      insert into tenant_square_payments (
        org_id, square_payment_id, status, amount, currency, customer_name,
        invoice_number, source_type, order_id, receipt_url, created_at, updated_at, raw
      ) values (
        ${orgId!}, ${payment.id}, ${payment.status}, ${payment.amount}, ${payment.currency},
        ${payment.customerName || null}, ${payment.invoiceNumber || null}, ${payment.sourceType || null},
        ${payment.orderId || null}, ${payment.receiptUrl || null}, ${payment.createdAt}, ${payment.updatedAt},
        ${payment.raw === undefined ? null : JSON.stringify(payment.raw)}::jsonb
      )
      on conflict (org_id, square_payment_id) do update set
        status = excluded.status,
        amount = excluded.amount,
        currency = excluded.currency,
        customer_name = excluded.customer_name,
        invoice_number = excluded.invoice_number,
        source_type = excluded.source_type,
        order_id = excluded.order_id,
        receipt_url = excluded.receipt_url,
        updated_at = now(),
        raw = excluded.raw
    `;
  } finally {
    await sql.end();
  }
}

export async function upsertSquarePaymentByOrderId(
  orderId: string,
  patch: Partial<StoredSquarePayment> & { id: string; createdAt: string; updatedAt: string },
  scope?: SquarePaymentScope,
) {
  if (!isTenantStorageEnabled()) {
    const list = readJsonFile<StoredSquarePayment[]>(FILE, []);
    const idx = list.findIndex((p) => p.orderId === orderId || p.id === patch.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch, id: patch.id || list[idx].id, orderId, updatedAt: new Date().toISOString() } as StoredSquarePayment;
    } else {
      list.unshift({ ...patch, orderId } as StoredSquarePayment);
    }
    writeJsonFileWithBackup(FILE, list.slice(0, 1000));
    return;
  }

  const orgId = await scopedOrgId(scope);
  const trustedScope = { orgId: orgId!, trustedSystem: true as const };
  const existing = (await listSquarePayments(trustedScope)).find((p) => p.orderId === orderId || p.id === patch.id);
  await upsertSquarePayment({
    id: patch.id || existing?.id || orderId,
    status: patch.status || existing?.status || 'PENDING',
    amount: patch.amount ?? existing?.amount ?? 0,
    currency: patch.currency || existing?.currency || 'USD',
    customerName: patch.customerName || existing?.customerName,
    invoiceNumber: patch.invoiceNumber || existing?.invoiceNumber,
    sourceType: patch.sourceType || existing?.sourceType,
    orderId,
    receiptUrl: patch.receiptUrl || existing?.receiptUrl,
    createdAt: existing?.createdAt || patch.createdAt,
    updatedAt: patch.updatedAt,
    raw: patch.raw ?? existing?.raw,
  }, trustedScope);
}
