import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { auditLogs, db } from '@/db';
import type { SquarePayment } from '@/lib/invoices/square-capture-intent';

type CheckoutRecord = {
  orderId: string; paymentLinkId: string; customerName: string; collectorEmployeeId: string;
  invoiceNumber?: string; amount: number;
};

function identity(value: string) {
  const hash = createHash('sha256').update(value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function saveCheckoutRecord(orgId: string, record: CheckoutRecord) {
  const id = identity(`${orgId}:checkout:${record.orderId}`);
  await db.insert(auditLogs).values({ id, orgId, entityId: id, entityType: 'square_checkout',
    action: 'created', newValue: record }).onConflictDoNothing();
}

export async function getCheckoutRecord(orgId: string, orderId: string) {
  const [row] = await db.select().from(auditLogs).where(and(eq(auditLogs.orgId, orgId),
    eq(auditLogs.entityType, 'square_checkout'), eq(auditLogs.action, 'created'),
    eq(auditLogs.id, identity(`${orgId}:checkout:${orderId}`))));
  return row ? row.newValue as CheckoutRecord : null;
}

export async function recordCheckoutPayment(orgId: string, checkout: CheckoutRecord, payment: SquarePayment) {
  if (payment.status !== 'COMPLETED') return;
  const id = identity(`${orgId}:checkout-payment:${payment.id}`);
  await db.insert(auditLogs).values({ id, orgId, entityId: identity(`${orgId}:checkout:${checkout.orderId}`),
    entityType: 'square_checkout', action: 'completed', newValue: {
      ...checkout, paymentId: payment.id, amount: payment.amount_money.amount / 100,
      receiptUrl: payment.receipt_url, paidAt: payment.created_at,
    } }).onConflictDoNothing();
}

export async function checkoutPaymentHistory(orgId: string, collectorEmployeeId?: string) {
  const rows = await db.select().from(auditLogs).where(and(eq(auditLogs.orgId, orgId),
    eq(auditLogs.entityType, 'square_checkout'), eq(auditLogs.action, 'completed'),
    ...(collectorEmployeeId ? [sql`${auditLogs.newValue}->>'collectorEmployeeId' = ${collectorEmployeeId}`] : [])))
    .orderBy(sql`${auditLogs.createdAt} desc`).limit(100);
  return rows.map(row => {
    const record = row.newValue as CheckoutRecord & {paymentId: string; receiptUrl?: string; paidAt?: string};
    return { id: record.paymentId, invoiceId: '', invoiceNumber: record.invoiceNumber || '', customerId: '',
      customerName: record.customerName, amount: record.amount, method: 'credit_card' as const, status: 'completed' as const,
      paymentDate: record.paidAt || row.createdAt?.toISOString() || '', transactionId: record.paymentId,
      receiptUrl: record.receiptUrl, notes: record.invoiceNumber ? 'Square payment link' : 'Unapplied payment: office reconciliation needed' };
  });
}
