import { createHash } from 'node:crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import { auditLogs, customers, db, invoices, organizations, payments } from '@/db';
import type { QBTokens } from '@/lib/quickbooks/types';

export class PaymentRecordingError extends Error {
  constructor(public code: string) { super(code); }
}

export function paymentRecordingId(orgId: string, transactionId: string, phase = 'payment') {
  const hex = createHash('sha256').update(JSON.stringify(['square-payment-v1', phase, orgId, transactionId])).digest('hex');
  // Neither invoice nor realm participates: a reconnect cannot create a fresh export identity.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function paymentCents(value: string) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new PaymentRecordingError('invalid_stored_amount');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 9_999_999_999) throw new PaymentRecordingError('invalid_stored_amount');
  return cents;
}

const pendingNote = 'Local payment recorded. QuickBooks export pending or unresolved; review before any resubmission.';
const reviewNote = 'Local payment recorded. QuickBooks export requires review; no automatic export will be attempted.';
type ExportStatus = 'pending' | 'review_required' | 'exported';
type Claim = { realmId: string | null; paymentId: string; invoiceId: string; transactionId: string; cents: number; historical: boolean };
const eventWhere = (id: string, orgId: string, action: string) => and(eq(auditLogs.id, id),
  eq(auditLogs.orgId, orgId), eq(auditLogs.entityType, 'payment_export'), eq(auditLogs.action, action));

export async function preparePayment(input: {
  orgId: string; invoiceNumber: string; invoiceId?: string; transactionId: string; cents: number;
  paymentMethod: string; paidAt: Date; notes?: string;
}) {
  return db.transaction(async tx => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, input.orgId)).for('share');
    if (!org) throw new PaymentRecordingError('organization_not_found');
    const number = input.invoiceNumber.replace(/^QB-/i, '').trim();
    const filters = [eq(invoices.qbInvoiceId, number), eq(invoices.invoiceNumber, number),
      eq(invoices.invoiceNumber, `QB-${number}`), eq(invoices.invoiceNumber, input.invoiceNumber)];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(number)) filters.push(eq(invoices.id, number));
    const matches = await tx.select().from(invoices)
      .where(and(eq(invoices.orgId, org.id), input.invoiceId ? eq(invoices.id, input.invoiceId) : or(...filters)))
      .orderBy(invoices.id).limit(2).for('update');
    if (matches.length !== 1) throw new PaymentRecordingError(matches.length ? 'ambiguous_invoice' : 'invoice_not_found');
    const invoice = matches[0];
    const [customer] = await tx.select().from(customers)
      .where(and(eq(customers.id, invoice.customerId), eq(customers.orgId, org.id))).for('share');
    if (!customer) throw new PaymentRecordingError('customer_scope_mismatch');

    const identity = paymentRecordingId(org.id, input.transactionId);
    const claimId = paymentRecordingId(org.id, input.transactionId, 'claim');
    const completionId = paymentRecordingId(org.id, input.transactionId, 'complete');
    const duplicates = () => tx.select().from(payments)
      .where(and(eq(payments.orgId, org.id), eq(payments.transactionId, input.transactionId)));
    let existing = await duplicates();
    let inserted = false;
    if (existing.length === 0) {
      const rows = await tx.insert(payments).values({ id: identity, orgId: org.id, invoiceId: invoice.id,
        amount: (input.cents / 100).toFixed(2), paymentMethod: input.paymentMethod,
        transactionId: input.transactionId, paidAt: input.paidAt,
        notes: [input.notes, pendingNote].filter(Boolean).join('\n'),
      }).onConflictDoNothing({ target: payments.id }).returning();
      inserted = rows.length === 1;
      // A cross-invoice writer can win the PK while we wait. Read its committed allocation.
      existing = inserted ? rows : await duplicates();
    }
    if (existing.length !== 1 || existing[0].invoiceId !== invoice.id || paymentCents(existing[0].amount) !== input.cents) {
      throw new PaymentRecordingError('transaction_conflict');
    }
    const payment = existing[0];
    const claim: Claim = { realmId: org.qbRealmId, paymentId: payment.id, invoiceId: invoice.id,
      transactionId: input.transactionId, cents: input.cents, historical: !inserted };
    const claimed = await tx.insert(auditLogs).values({ id: claimId, orgId: org.id, entityType: 'payment_export',
      entityId: payment.id, action: 'claim', newValue: claim,
    }).onConflictDoNothing({ target: auditLogs.id }).returning({ id: auditLogs.id });
    const [savedClaim] = await tx.select().from(auditLogs).where(eventWhere(claimId, org.id, 'claim'));
    const value = savedClaim?.newValue as Claim | undefined;
    if (!value || value.paymentId !== payment.id || value.invoiceId !== invoice.id
      || value.transactionId !== input.transactionId || value.cents !== input.cents) {
      throw new PaymentRecordingError('transaction_conflict');
    }

    // Keep the existing financial definition: sum recorded payments, clamp at zero,
    // and mark paid only for a positive invoice total. Never rewrite historical payments.
    const rows = await tx.select({ amount: payments.amount, orgId: payments.orgId }).from(payments)
      .where(eq(payments.invoiceId, invoice.id));
    if (rows.some(row => row.orgId !== org.id)) throw new PaymentRecordingError('payment_scope_mismatch');
    const paidCents = rows.reduce((sum, row) => sum + BigInt(paymentCents(row.amount)), BigInt(0));
    const total = paymentCents(invoice.totalAmount);
    const remaining = BigInt(total) - paidCents;
    const balanceCents = remaining > BigInt(0) ? Number(remaining) : 0;
    if (!Number.isSafeInteger(balanceCents) || balanceCents > 9_999_999_999) throw new PaymentRecordingError('invalid_stored_amount');
    const paid = balanceCents === 0 && total > 0;
    await tx.update(invoices).set({ balance: (balanceCents / 100).toFixed(2), status: paid ? 'paid' : 'sent',
      paidAt: paid ? (inserted ? input.paidAt : invoice.paidAt ?? payment.paidAt) : invoice.paidAt,
      updatedAt: new Date(),
    }).where(and(eq(invoices.id, invoice.id), eq(invoices.orgId, org.id)));

    const [completion] = await tx.select().from(auditLogs).where(eventWhere(completionId, org.id, 'complete'));
    const completed = completion?.newValue as (Claim & { qbPaymentId: string }) | undefined;
    const exported = !!completed && completed.realmId === org.qbRealmId && completed.realmId === value.realmId
      && completed.paymentId === payment.id && completed.invoiceId === invoice.id
      && completed.transactionId === input.transactionId && completed.cents === input.cents
      && !!payment.qbPaymentId && completed.qbPaymentId === payment.qbPaymentId;
    const shouldExport = inserted && claimed.length === 1 && !payment.qbPaymentId
      && !!org.qbAccessToken && !!org.qbRefreshToken && !!org.qbRealmId && !!invoice.qbInvoiceId && !!customer.qbCustomerId;
    const status: ExportStatus = exported ? 'exported' : shouldExport ? 'pending' : 'review_required';
    return { org, invoice, payment, qbCustomerId: customer.qbCustomerId, claim: value, claimId, completionId,
      balance: balanceCents / 100, paid, shouldExport, status,
      qbPaymentId: exported ? payment.qbPaymentId! : undefined,
      note: exported ? 'QuickBooks export completed.' : shouldExport ? pendingNote : reviewNote };
  });
}

export async function completePaymentExport(local: Awaited<ReturnType<typeof preparePayment>>, qbPaymentId: string) {
  await db.transaction(async tx => {
    const [org] = await tx.select({ realmId: organizations.qbRealmId }).from(organizations)
      .where(eq(organizations.id, local.org.id)).for('update');
    if (!local.shouldExport || local.claim.historical || !org?.realmId || org.realmId !== local.claim.realmId) {
      throw new PaymentRecordingError('export_review_required');
    }
    const [claim] = await tx.select().from(auditLogs).where(eventWhere(local.claimId, local.org.id, 'claim'));
    const value = claim?.newValue as Claim | undefined;
    if (!value || value.realmId !== local.claim.realmId || value.paymentId !== local.payment.id
      || value.invoiceId !== local.invoice.id || value.cents !== local.claim.cents
      || value.transactionId !== local.claim.transactionId || value.historical) throw new PaymentRecordingError('export_review_required');
    const [completion] = await tx.select().from(auditLogs).where(eventWhere(local.completionId, local.org.id, 'complete'));
    if (completion) {
      // A marked QB import can bind the response while createPayment is still returning.
      // Only that exact durable result is success; never retry or overwrite a competing result.
      const completed = completion.newValue as (Claim & { qbPaymentId: string }) | null;
      const [payment] = await tx.select().from(payments).where(and(eq(payments.id, local.payment.id),
        eq(payments.orgId, local.org.id))).for('update');
      if (completion.entityId === local.payment.id && completed?.realmId === local.claim.realmId
        && completed.paymentId === local.payment.id && completed.invoiceId === local.invoice.id
        && completed.transactionId === local.claim.transactionId && completed.cents === local.claim.cents
        && completed.historical === false && completed.qbPaymentId === qbPaymentId
        && payment?.qbPaymentId === qbPaymentId && payment.invoiceId === local.invoice.id
        && payment.transactionId === local.claim.transactionId && paymentCents(payment.amount) === local.claim.cents) return;
      throw new PaymentRecordingError('export_review_required');
    }
    const notes = local.payment.notes?.endsWith(pendingNote) ? local.payment.notes.slice(0, -pendingNote.length).trimEnd() : local.payment.notes;
    const saved = await tx.update(payments).set({ qbPaymentId,
      notes: [notes, 'QuickBooks export completed.'].filter(Boolean).join('\n'),
    }).where(and(eq(payments.id, local.payment.id), eq(payments.orgId, local.org.id),
      eq(payments.invoiceId, local.invoice.id), eq(payments.transactionId, local.claim.transactionId),
      eq(payments.amount, local.payment.amount), isNull(payments.qbPaymentId))).returning({ id: payments.id });
    if (saved.length !== 1) throw new PaymentRecordingError('export_review_required');
    await tx.insert(auditLogs).values({ id: local.completionId, orgId: local.org.id, entityType: 'payment_export',
      entityId: local.payment.id, action: 'complete', newValue: { ...local.claim, qbPaymentId } });
  });
}

export async function persistPaymentTokens(org: typeof organizations.$inferSelect, tokens: QBTokens) {
  const saved = await db.update(organizations).set({ qbAccessToken: tokens.access_token,
    qbRefreshToken: tokens.refresh_token, qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000), updatedAt: new Date(),
  }).where(and(eq(organizations.id, org.id), eq(organizations.qbRealmId, org.qbRealmId!),
    eq(organizations.qbRefreshToken, org.qbRefreshToken!))).returning({ id: organizations.id });
  return saved.length === 1;
}
