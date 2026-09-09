import { and, eq, or } from 'drizzle-orm';
import { auditLogs, customers, db, invoices, organizations, payments } from '@/db';
import type { QBPayment } from '@/lib/quickbooks/types';
import { paymentCents, paymentRecordingId } from './payment-recording-store';

export class PaymentImportReviewError extends Error {
  readonly code = 'PAYMENT_IMPORT_REVIEW_REQUIRED';
  constructor() { super('Marked QuickBooks payment needs review; no new allocation was imported.'); }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const MARKER = new RegExp(`^HearthOS payment: (${UUID})\\r?\\n`);
const numericId = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{1,50}$/.test(value);
type MarkedPayment = { localId: string; qbId: string; cents: number; customerRef: string; invoiceRef: string; date: string };
type ExportClaim = { realmId: string; paymentId: string; invoiceId: string; transactionId: string; cents: number; historical: boolean; qbPaymentId?: string };

function cents(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new PaymentImportReviewError();
  try { return paymentCents(String(value)); } catch { throw new PaymentImportReviewError(); }
}

function parseMarkedPayment(payment: QBPayment): MarkedPayment | null {
  const note = payment.PrivateNote;
  if (note === undefined || note === null) return null;
  if (typeof note !== 'string') throw new PaymentImportReviewError();
  if (!/HearthOS payment:/i.test(note)) return null;
  const marker = note.match(MARKER);
  if (!marker || note.length > 4000 || (note.match(/HearthOS payment:/gi)?.length ?? 0) !== 1) throw new PaymentImportReviewError();
  const rawLinked = payment.Line?.[0]?.LinkedTxn;
  const linked = Array.isArray(rawLinked) ? rawLinked
    : rawLinked && typeof rawLinked === 'object' ? [rawLinked] : null;
  const total = cents(payment.TotalAmt);
  if (!numericId(payment.Id) || total <= 0 || !numericId(payment.CustomerRef?.value)
    || !Array.isArray(payment.Line) || payment.Line.length !== 1 || !payment.Line[0] || typeof payment.Line[0] !== 'object'
    || cents(payment.Line[0].Amount) !== total || !linked || linked.length !== 1 || !linked[0] || typeof linked[0] !== 'object'
    || linked[0].TxnType !== 'Invoice' || !numericId(linked[0].TxnId)
    || (payment.UnappliedAmt !== undefined && cents(payment.UnappliedAmt) !== 0)
    || typeof payment.TxnDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payment.TxnDate)) throw new PaymentImportReviewError();
  const currency = (payment as QBPayment & { CurrencyRef?: { value?: unknown } }).CurrencyRef;
  if (currency !== undefined && currency?.value !== 'USD') throw new PaymentImportReviewError();
  return { localId: marker[1], qbId: payment.Id, cents: total,
    customerRef: payment.CustomerRef.value, invoiceRef: linked[0].TxnId, date: payment.TxnDate };
}

// New markers only: unmarked imports keep the legacy path. Historical duplicate
// allocations are deliberately not merged, deleted, or re-valued here.
export async function reconcileMarkedPaymentImports(orgId: string, incoming: QBPayment[]) {
  const unmarked: QBPayment[] = [];
  const marked = new Map<string, MarkedPayment>();
  const byLocalId = new Map<string, string>();
  for (const payment of incoming) {
    const parsed = parseMarkedPayment(payment);
    if (!parsed) { unmarked.push(payment); continue; }
    const previous = marked.get(parsed.qbId);
    if ((previous && JSON.stringify(previous) !== JSON.stringify(parsed))
      || (byLocalId.has(parsed.localId) && byLocalId.get(parsed.localId) !== parsed.qbId)) throw new PaymentImportReviewError();
    marked.set(parsed.qbId, parsed);
    byLocalId.set(parsed.localId, parsed.qbId);
  }
  if (!marked.size) return { unmarked, reconciled: 0 };
  // Conflicting representations of the same provider payment must not leak into
  // the legacy upsert and overwrite a reconciled allocation later in this batch.
  if (unmarked.some(payment => marked.has(payment.Id))) throw new PaymentImportReviewError();
  await db.transaction(async tx => {
    const [org] = await tx.select({ realmId: organizations.qbRealmId }).from(organizations)
      .where(eq(organizations.id, orgId)).for('update');
    if (!org?.realmId) throw new PaymentImportReviewError();
    for (const imported of marked.values()) {
      const invoiceRows = await tx.select().from(invoices).where(and(eq(invoices.orgId, orgId),
        eq(invoices.qbInvoiceId, imported.invoiceRef))).limit(2).for('update');
      if (invoiceRows.length !== 1) throw new PaymentImportReviewError();
      const invoice = invoiceRows[0];
      const customerRows = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.orgId, orgId),
        eq(customers.qbCustomerId, imported.customerRef))).limit(2).for('share');
      if (customerRows.length !== 1 || customerRows[0].id !== invoice.customerId) throw new PaymentImportReviewError();
      const [local] = await tx.select().from(payments).where(and(eq(payments.orgId, orgId),
        eq(payments.id, imported.localId))).for('update');
      if (!local || local.invoiceId !== invoice.id || !local.transactionId
        || local.id !== paymentRecordingId(orgId, local.transactionId)
        || paymentCents(local.amount) !== imported.cents || local.paidAt?.toISOString().slice(0, 10) !== imported.date
        || (local.qbPaymentId !== null && local.qbPaymentId !== imported.qbId)) throw new PaymentImportReviewError();
      const duplicates = await tx.select({ id: payments.id }).from(payments).where(and(eq(payments.orgId, orgId),
        or(eq(payments.transactionId, local.transactionId), eq(payments.qbPaymentId, imported.qbId))));
      if (duplicates.some(row => row.id !== local.id)) throw new PaymentImportReviewError();
      const claimId = paymentRecordingId(orgId, local.transactionId, 'claim');
      const completionId = paymentRecordingId(orgId, local.transactionId, 'complete');
      const [claimRow] = await tx.select().from(auditLogs).where(eq(auditLogs.id, claimId));
      const claim = claimRow?.newValue as ExportClaim | undefined;
      const matches = (value: ExportClaim | undefined) => value && value.realmId === org.realmId
        && value.paymentId === local.id && value.invoiceId === invoice.id
        && value.transactionId === local.transactionId && value.cents === imported.cents && value.historical === false;
      if (!claimRow || claimRow.orgId !== orgId || claimRow.entityType !== 'payment_export'
        || claimRow.entityId !== local.id || claimRow.action !== 'claim' || !matches(claim)) throw new PaymentImportReviewError();
      const [completion] = await tx.select().from(auditLogs).where(eq(auditLogs.id, completionId));
      if (completion) {
        const value = completion.newValue as ExportClaim | undefined;
        if (completion.orgId !== orgId || completion.entityType !== 'payment_export' || completion.entityId !== local.id
          || completion.action !== 'complete' || !matches(value) || value?.qbPaymentId !== imported.qbId
          || local.qbPaymentId !== imported.qbId) throw new PaymentImportReviewError();
        continue;
      }
      // A pre-existing attachment without our durable completion is not evidence
      // that this claim owns the provider payment; require review instead.
      if (local.qbPaymentId !== null) throw new PaymentImportReviewError();
      const attached = await tx.update(payments).set({ qbPaymentId: imported.qbId })
        .where(and(eq(payments.id, local.id), eq(payments.orgId, orgId)))
        .returning({ id: payments.id, qbId: payments.qbPaymentId, amount: payments.amount });
      if (attached.length !== 1 || attached[0].qbId !== imported.qbId || paymentCents(attached[0].amount) !== imported.cents) {
        throw new PaymentImportReviewError();
      }
      await tx.insert(auditLogs).values({ id: completionId, orgId, entityType: 'payment_export', entityId: local.id,
        action: 'complete', newValue: { ...claim, qbPaymentId: imported.qbId } });
    }
  }).catch(() => { throw new PaymentImportReviewError(); });
  return { unmarked, reconciled: marked.size };
}
