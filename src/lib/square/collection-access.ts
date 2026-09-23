import 'server-only';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { auditLogs, customers, db, invoices } from '@/db';
import { listJobs } from '@/lib/job-store';
import { requireCrmActor } from '@/lib/security/crm-access';
import { captureIntentId, resolveSquareInvoice, squareOrganization, type CaptureIntent, type SquarePayment } from '@/lib/invoices/square-capture-intent';
import { CollectionAccessError, selectCollectionInvoice } from './collection-policy';
import { checkoutPaymentHistory } from './checkout-records';

async function collectionScope(reference: string) {
  const actor = await requireCrmActor();
  // This release uses Aaron's legacy job store and configured Square account.
  if (actor.orgId !== await squareOrganization()) throw new CollectionAccessError('Square is not connected for this organization.');
  const jobs = (await listJobs()).filter(job => job.id === reference);
  const customerIds = [...new Set(jobs.map(job => job.customerId).filter(Boolean))];
  const rows = customerIds.length ? await db.select({
    id: invoices.id, invoiceNumber: invoices.invoiceNumber, qbInvoiceId: invoices.qbInvoiceId,
    customerId: invoices.customerId, qbCustomerId: customers.qbCustomerId,
    customerName: sql<string>`trim(concat_ws(' ', ${customers.firstName}, ${customers.lastName}))`,
    balance: invoices.balance, status: invoices.status, jobId: invoices.jobId,
  }).from(invoices).innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.orgId, actor.orgId)))
    .where(and(eq(invoices.orgId, actor.orgId), or(inArray(sql<string>`${customers.id}::text`, customerIds),
      inArray(customers.qbCustomerId, customerIds)))) : [];
  return { actor, jobs, invoices: rows };
}

export async function authorizeSquareCollection(reference: unknown, amount: number, mode: 'capture' | 'checkout', customerName?: string,
  capture?: { sourceId: string; locationId: string }) {
  const actor = await requireCrmActor();
  if (actor.orgId !== await squareOrganization()) throw new CollectionAccessError('Square is not connected for this organization.');
  const context = { collectorEmployeeId: actor.employeeId, customerName: customerName?.trim() || 'Customer' };
  if (reference === undefined || reference === '') {
    if (actor.role === 'technician' && !customerName?.trim()) throw new CollectionAccessError('Enter the customer name for office reconciliation.', 400);
    return { ...context, invoiceNumber: undefined };
  }
  if (typeof reference !== 'string' || !reference.trim()) throw new CollectionAccessError('Invalid payment reference.', 400);
  const scope = await collectionScope(reference.trim());
  const job = scope.jobs[0];
  if (job && mode === 'capture' && capture) {
    // A completed attempt may have closed the only open invoice. Preserve that
    // attempt's allocation; reserveCapture still verifies amount and identity.
    const [reservation] = await db.select().from(auditLogs).where(and(eq(auditLogs.orgId, actor.orgId),
      eq(auditLogs.id, captureIntentId(actor.orgId, capture.locationId, capture.sourceId)),
      eq(auditLogs.entityType, 'square_capture'), eq(auditLogs.action, 'reserved'))).limit(1);
    const prior = reservation?.newValue as CaptureIntent | undefined;
    if (prior?.jobId === job.id && prior.collectorEmployeeId === actor.employeeId) {
      return { ...context, customerName: prior.customerName || context.customerName,
        jobId: job.id, invoiceNumber: prior.invoiceNumber || undefined };
    }
  }
  const invoice = job ? selectCollectionInvoice(reference.trim(), scope.jobs, scope.invoices)
    : await resolveSquareInvoice(actor.orgId, reference.trim());
  // An unlinked job can collect an unapplied payment; never guess between invoices.
  if (!invoice) return { ...context, customerName: job.customerName, jobId: job.id, invoiceNumber: undefined };
  // Card capture checks balance under lock, after looking for an idempotent replay.
  if (mode === 'checkout' && (invoice.status === 'void' || !Number.isFinite(amount) || amount <= 0
    || !Number.isFinite(Number(invoice.balance)) || Math.round(amount * 100) > Math.round(Number(invoice.balance) * 100))) {
    throw new CollectionAccessError('The amount exceeds the invoice balance. Check the invoice before collecting payment.', 400);
  }
  return { ...context, customerName: job?.customerName || context.customerName, jobId: job?.id, invoiceNumber: invoice.invoiceNumber };
}

export async function recordedSquareTransactions() {
  const actor = await requireCrmActor();
  if (actor.orgId !== await squareOrganization()) throw new CollectionAccessError('Square is not connected for this organization.');
  const restricted = actor.role === 'technician';
  const reservations = await db.select().from(auditLogs).where(and(eq(auditLogs.orgId, actor.orgId),
    eq(auditLogs.entityType, 'square_capture'), eq(auditLogs.action, 'reserved'),
    ...(restricted ? [sql`${auditLogs.newValue}->>'collectorEmployeeId' = ${actor.employeeId}`] : [])))
    .orderBy(sql`${auditLogs.createdAt} desc`).limit(100);
  const events = reservations.length ? await db.select().from(auditLogs).where(and(eq(auditLogs.orgId, actor.orgId),
    eq(auditLogs.entityType, 'square_capture'), inArray(auditLogs.entityId, reservations.map(row => row.id)))) : [];
  const payments = reservations.flatMap(row => {
    const intent = row.newValue as CaptureIntent;
    const confirmed = events.find(event => event.entityId === row.id && event.action === 'confirmed');
    const payment = confirmed?.newValue as SquarePayment | undefined;
    if (!payment) return [];
    return [{ id: payment.id, invoiceId: intent.invoiceId || '', invoiceNumber: intent.invoiceNumber || '',
      customerId: '', customerName: intent.customerName || 'Customer', amount: intent.amountCents / 100,
      method: 'credit_card' as const, status: 'completed' as const,
      paymentDate: payment.created_at || row.createdAt?.toISOString() || '', transactionId: payment.id,
      receiptUrl: payment.receipt_url,
      notes: intent.invoiceId ? 'Recorded in HearthOS' : 'Unapplied payment: office reconciliation needed',
    }];
  });
  const links = await checkoutPaymentHistory(actor.orgId, restricted ? actor.employeeId : undefined);
  return { restricted, payments: [...payments, ...links].sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate)).slice(0, 100) };
}
