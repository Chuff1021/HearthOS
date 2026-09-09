import { createHash } from 'node:crypto';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { auditLogs, db, invoices, organizations, payments } from '@/db';
import { paymentCents } from './payment-recording-store';

const ENTITY = 'square_capture';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type CaptureIntent = {
  id: string; orgId: string; locationId: string; sourceHash: string; amountCents: number; principalCents: number; feeCents: number;
  invoiceId: string | null; invoiceNumber: string | null; linkHash: string | null; maxCents: number | null;
};
export type SquarePayment = {
  id: string; status: 'COMPLETED' | 'APPROVED' | 'PENDING' | 'FAILED' | 'CANCELED';
  amount_money: { amount: number; currency: 'USD' }; location_id: string;
  reference_id?: string; source_type?: string; order_id?: string; receipt_url?: string;
  created_at?: string; updated_at?: string;
};

export class CaptureError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export function captureHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function verifiedLinkHash(token: string) {
  // Called only after route signature verification. Equivalent base64url
  // spellings (including padding) must share one cumulative authorization cap.
  return captureHash(JSON.stringify(token.split('.').map(part => Buffer.from(part, 'base64url').toString('base64url'))));
}
function eventId(value: string) {
  const hash = captureHash(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function captureIntentId(orgId: string, locationId: string, sourceId: string) {
  return eventId(JSON.stringify([ENTITY, orgId, locationId, captureHash(sourceId)]));
}
export function dollarsToCents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value);
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

// Square uses the configured single-org context, never a caller-supplied org.
export async function squareOrganization() {
  const [org] = await db.select({ id: organizations.id }).from(organizations)
    .where(eq(organizations.slug, 'default')).limit(1);
  if (!org) throw new CaptureError('SQUARE_ORGANIZATION_UNAVAILABLE', 503);
  return org.id;
}

export async function resolveSquareInvoice(orgId: string, reference: string, tx: Transaction | typeof db = db) {
  const raw = reference.trim();
  const clean = raw.replace(/^QB-/i, '');
  // Public links identify the emailed DocNumber. A different invoice's QB ID
  // must not make that document ambiguous or redirect its payment allocation.
  const documents = await tx.select().from(invoices).where(and(eq(invoices.orgId, orgId), or(
    eq(invoices.invoiceNumber, raw), eq(invoices.invoiceNumber, clean), eq(invoices.invoiceNumber, `QB-${clean}`))))
    .limit(2).for('update');
  if (documents.length > 1) throw new CaptureError('INVOICE_NOT_UNAMBIGUOUS');
  if (documents.length === 1) return documents[0];
  const fallback = [eq(invoices.qbInvoiceId, clean)];
  if (UUID.test(raw)) fallback.push(eq(invoices.id, raw));
  const rows = await tx.select().from(invoices).where(and(eq(invoices.orgId, orgId), or(...fallback)))
    .limit(2).for('update');
  if (rows.length !== 1) throw new CaptureError('INVOICE_NOT_UNAMBIGUOUS');
  return rows[0];
}

async function events(tx: Transaction | typeof db, intent: CaptureIntent) {
  return tx.select().from(auditLogs).where(and(eq(auditLogs.orgId, intent.orgId),
    eq(auditLogs.entityType, ENTITY), eq(auditLogs.entityId, intent.id)));
}
async function append(tx: Transaction, intent: CaptureIntent, action: string, value: unknown) {
  await tx.insert(auditLogs).values({ id: eventId(`${intent.id}:${action}`), orgId: intent.orgId,
    entityType: ENTITY, entityId: intent.id, action, newValue: value }).onConflictDoNothing();
}
export async function getCaptureIntent(orgId: string, reference: string) {
  const id = reference.slice(4);
  if (!reference.startsWith('hos_') || !UUID.test(id)) throw new CaptureError('INVALID_CAPTURE_REFERENCE');
  const [row] = await db.select().from(auditLogs).where(and(eq(auditLogs.id, id),
    eq(auditLogs.orgId, orgId), eq(auditLogs.entityType, ENTITY), eq(auditLogs.action, 'reserved'))).limit(1);
  if (!row) throw new CaptureError('CAPTURE_INTENT_NOT_FOUND');
  return row.newValue as CaptureIntent;
}

export async function reserveCapture(input: {
  orgId: string; locationId: string; sourceId: string; amountCents: number; principalCents?: number;
  invoiceNumber?: string; token?: string; maxCents?: number;
}) {
  const principalCents = input.principalCents ?? input.amountCents;
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 9999999999
    || !Number.isSafeInteger(principalCents) || principalCents <= 0 || principalCents > input.amountCents
    || (principalCents !== input.amountCents && input.amountCents !== principalCents + Math.round(principalCents * 35 / 1000))
    || typeof input.sourceId !== 'string' || !input.sourceId.trim() || input.sourceId.length > 4096
    || (input.token !== undefined && (!input.invoiceNumber || !Number.isSafeInteger(input.maxCents) || input.maxCents! <= 0))) {
    throw new CaptureError('INVALID_CAPTURE_INPUT', 400);
  }
  return db.transaction(async tx => {
    // A token can outlive an invoice-number reassignment. Its cap is org-wide;
    // keep the short claim transaction serialized before taking invoice locks.
    await tx.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.id, input.orgId)).for('update');
    const invoice = input.invoiceNumber ? await resolveSquareInvoice(input.orgId, input.invoiceNumber, tx) : null;
    const intent: CaptureIntent = {
      id: captureIntentId(input.orgId, input.locationId, input.sourceId), orgId: input.orgId,
      locationId: input.locationId, sourceHash: captureHash(input.sourceId), amountCents: input.amountCents, principalCents,
      feeCents: input.amountCents - principalCents,
      invoiceId: invoice?.id ?? null, invoiceNumber: invoice?.invoiceNumber ?? null,
      linkHash: input.token === undefined ? null : verifiedLinkHash(input.token),
      maxCents: input.maxCents ?? null,
    };
    const [existing] = await tx.select().from(auditLogs).where(eq(auditLogs.id, intent.id));
    if (existing) {
      const prior = existing.newValue as CaptureIntent;
      if (existing.orgId !== intent.orgId || existing.entityType !== ENTITY || existing.action !== 'reserved'
        || prior.amountCents !== intent.amountCents || prior.principalCents !== intent.principalCents || prior.invoiceId !== intent.invoiceId
        || prior.linkHash !== intent.linkHash || prior.locationId !== intent.locationId) {
        throw new CaptureError('CAPTURE_INTENT_CONFLICT');
      }
      const history = await events(tx, intent);
      const settled = history.find(row => row.action === 'settled');
      return { intent: prior, fresh: false, result: settled?.newValue, invoiceNumber: invoice?.invoiceNumber };
    }
    if (invoice) {
      if (invoice.status === 'paid' || invoice.status === 'void' || Number(invoice.balance) <= 0) throw new CaptureError('INVOICE_ALREADY_PAID');
      // Sync may restore a stale provider balance; committed local allocations
      // are an independent upper bound. Foreign or malformed rows fail closed.
      const allocations = await tx.select({ amount: payments.amount, orgId: payments.orgId }).from(payments)
        .where(eq(payments.invoiceId, invoice.id));
      let paidCents = 0;
      for (const allocation of allocations) {
        if (allocation.orgId !== input.orgId) throw new CaptureError('INVOICE_PAYMENT_REVIEW_REQUIRED');
        let cents;
        try { cents = paymentCents(allocation.amount); } catch { throw new CaptureError('INVOICE_PAYMENT_REVIEW_REQUIRED'); }
        paidCents += cents;
        if (!Number.isSafeInteger(paidCents)) throw new CaptureError('INVOICE_PAYMENT_REVIEW_REQUIRED');
      }
      const reservations = await tx.select().from(auditLogs).where(and(eq(auditLogs.orgId, input.orgId),
        eq(auditLogs.entityType, ENTITY), eq(auditLogs.action, 'reserved'),
        or(sql`${auditLogs.newValue}->>'invoiceId' = ${invoice.id}`,
          ...(intent.linkHash ? [sql`${auditLogs.newValue}->>'linkHash' = ${intent.linkHash}`] : []))));
      const history = reservations.length ? await tx.select().from(auditLogs).where(and(
        eq(auditLogs.orgId, input.orgId), eq(auditLogs.entityType, ENTITY),
        inArray(auditLogs.entityId, reservations.map(row => row.id)))) : [];
      let pending = 0, linkUsed = 0, unresolved = false;
      for (const row of reservations) {
        const prior = row.newValue as CaptureIntent;
        const settled = history.some(event => event.entityId === row.id && event.action === 'settled');
        const released = history.some(event => event.entityId === row.id && event.action === 'released');
        if (!settled && !released) unresolved = true;
        if (!settled && !released && prior.invoiceId === invoice.id) pending += prior.principalCents;
        if (!released && intent.linkHash && prior.linkHash === intent.linkHash) linkUsed += prior.amountCents;
      }
      const balance = dollarsToCents(invoice.balance);
      const total = dollarsToCents(invoice.totalAmount);
      if (balance === null || total === null || principalCents + pending > Math.min(balance, total - paidCents)) {
        throw new CaptureError('INVOICE_BALANCE_RESERVED');
      }
      if (intent.maxCents !== null && input.amountCents + linkUsed > intent.maxCents) throw new CaptureError('PAYMENT_LINK_LIMIT');
      if (unresolved) throw new CaptureError('INVOICE_CAPTURE_PENDING');
    } else {
      const reservations = await tx.select().from(auditLogs).where(and(eq(auditLogs.orgId, input.orgId),
        eq(auditLogs.entityType, ENTITY), eq(auditLogs.action, 'reserved'),
        sql`${auditLogs.newValue}->>'invoiceId' IS NULL`, sql`${auditLogs.newValue}->>'locationId' = ${input.locationId}`));
      if (reservations.length) {
        const history = await tx.select().from(auditLogs).where(and(eq(auditLogs.orgId, input.orgId),
          eq(auditLogs.entityType, ENTITY), inArray(auditLogs.entityId, reservations.map(row => row.id)),
          inArray(auditLogs.action, ['settled', 'released'])));
        if (reservations.some(row => !history.some(event => event.entityId === row.id))) {
          throw new CaptureError('ADHOC_CAPTURE_PENDING');
        }
      }
    }
    const inserted = await tx.insert(auditLogs).values({ id: intent.id, orgId: intent.orgId,
      entityType: ENTITY, entityId: intent.id, action: 'reserved', newValue: intent })
      .onConflictDoNothing().returning({ id: auditLogs.id });
    if (!inserted.length) throw new CaptureError('CAPTURE_REVIEW_REQUIRED');
    return { intent, fresh: true, result: undefined, invoiceNumber: invoice?.invoiceNumber };
  });
}

export function validateSquarePayment(value: unknown, locationId: string, intent?: CaptureIntent): SquarePayment | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as SquarePayment;
  if (typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(p.id)
    || !['COMPLETED', 'APPROVED', 'PENDING', 'FAILED', 'CANCELED'].includes(p.status)
    || !Number.isSafeInteger(p.amount_money?.amount) || p.amount_money.amount <= 0
    || p.amount_money.amount > 9999999999 || p.amount_money.currency !== 'USD'
    || p.location_id !== locationId || !locationId
    || (p.reference_id !== undefined && (typeof p.reference_id !== 'string' || p.reference_id.length > 40))
    || (intent && (p.amount_money.amount !== intent.amountCents || p.location_id !== intent.locationId
      || p.reference_id !== `hos_${intent.id}`
      || (intent.principalCents !== intent.amountCents && p.source_type !== 'CARD')))) return null;
  for (const key of ['source_type', 'order_id', 'receipt_url', 'created_at', 'updated_at'] as const) {
    if (p[key] !== undefined && (typeof p[key] !== 'string' || p[key]!.length > (key === 'receipt_url' ? 2048 : 100))) return null;
  }
  if ((p.created_at !== undefined && !Number.isFinite(Date.parse(p.created_at)))
    || (p.updated_at !== undefined && !Number.isFinite(Date.parse(p.updated_at)))) return null;
  // Persist only the bounded response fields used by the native payment UI.
  return { id: p.id, status: p.status, amount_money: { amount: p.amount_money.amount, currency: 'USD' }, location_id: p.location_id,
    reference_id: p.reference_id, source_type: p.source_type, order_id: p.order_id,
    receipt_url: p.receipt_url, created_at: p.created_at, updated_at: p.updated_at };
}

// Serializes provider results, including a webhook racing a lost HTTP response.
export async function observeCapture(intent: CaptureIntent, payment: SquarePayment | null,
  project?: () => void) {
  if (payment && !validateSquarePayment(payment, intent.locationId, intent)) throw new CaptureError('CAPTURE_RESULT_CONFLICT');
  return db.transaction(async tx => {
    await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.id, intent.id),
      eq(auditLogs.orgId, intent.orgId))).for('update');
    const history = await events(tx, intent);
    const confirmed = history.find(row => row.action === 'confirmed')?.newValue as SquarePayment | undefined;
    const settled = history.find(row => row.action === 'settled');
    const released = history.some(row => row.action === 'released');
    const projectLocked = async () => {
      if (project) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'square-projection:' + intent.orgId}))`);
        project();
      }
    };
    if (settled || confirmed) {
      if (payment?.status !== 'COMPLETED') return 'ignored' as const;
      if (confirmed?.id !== payment.id) throw new CaptureError('CAPTURE_RESULT_CONFLICT');
      await projectLocked();
      return 'confirmed' as const;
    }
    if (released) {
      if (payment?.status === 'COMPLETED') throw new CaptureError('CAPTURE_RESULT_CONFLICT');
      return 'ignored' as const;
    }
    if (!payment || payment.status === 'FAILED' || payment.status === 'CANCELED') {
      await append(tx, intent, 'released', { paymentId: payment?.id ?? null, reason: payment?.status ?? 'rejected' });
    } else if (payment.status === 'COMPLETED') {
      await append(tx, intent, 'confirmed', payment);
    }
    await projectLocked();
    return !payment || ['FAILED', 'CANCELED'].includes(payment.status) ? 'released' as const
      : payment.status === 'COMPLETED' ? 'confirmed' as const : 'pending' as const;
  });
}

export async function replaySettledCapture(intent: CaptureIntent, saved: unknown) {
  const result = saved as { payment?: unknown; invoicePayment?: Record<string, unknown> } | undefined;
  const payment = validateSquarePayment(result?.payment, intent.locationId, intent);
  if (!payment || payment.status !== 'COMPLETED') throw new CaptureError('CAPTURE_REVIEW_REQUIRED');
  if (!intent.invoiceId) return { ok: true, retrySafe: false, paymentId: payment.id,
    status: payment.status, receiptUrl: payment.receipt_url, payment };
  return db.transaction(async tx => {
    const [org] = await tx.select({ realmId: organizations.qbRealmId }).from(organizations)
      .where(eq(organizations.id, intent.orgId)).for('share');
    const rows = await tx.select().from(payments).where(and(eq(payments.orgId, intent.orgId), eq(payments.transactionId, payment.id)));
    const local = rows.length === 1 && rows[0].invoiceId === intent.invoiceId
      && dollarsToCents(rows[0].amount) === intent.principalCents ? rows[0] : undefined;
    const history = local ? await tx.select().from(auditLogs).where(and(eq(auditLogs.orgId, intent.orgId),
      eq(auditLogs.entityType, 'payment_export'), eq(auditLogs.entityId, local.id))) : [];
    const claims = history.filter(row => row.action === 'claim');
    const completions = history.filter(row => row.action === 'complete');
    const matches = (value: unknown) => {
      const event = value as Record<string, unknown> | null;
      return event && org?.realmId && event.realmId === org.realmId && event.paymentId === local?.id
        && event.invoiceId === intent.invoiceId && event.transactionId === payment.id && event.cents === intent.principalCents;
    };
    const completed = completions[0]?.newValue as Record<string, unknown> | undefined;
    const exported = !!local?.qbPaymentId && claims.length === 1 && completions.length === 1
      && matches(claims[0].newValue) && matches(completed) && completed?.qbPaymentId === local.qbPaymentId;
    return { ok: true, retrySafe: false, paymentId: payment.id, status: payment.status, receiptUrl: payment.receipt_url,
      payment, invoicePayment: { ...result?.invoicePayment, recorded: !!local,
        qbPaymentId: exported ? local?.qbPaymentId : undefined,
        qbExportStatus: exported ? 'exported' : 'review_required',
        qbExportNote: exported ? 'QuickBooks export completed.' : 'Captured payment needs accounting review; do not resubmit.' } };
  });
}

export async function projectLegacySquarePayment(orgId: string, project: () => void) {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'square-projection:' + orgId}))`);
    project();
  });
}

export async function settleCapture(intent: CaptureIntent, payment: SquarePayment, invoicePayment: unknown) {
  return db.transaction(async tx => {
    await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.id, intent.id),
      eq(auditLogs.orgId, intent.orgId))).for('update');
    const history = await events(tx, intent);
    const confirmed = history.find(row => row.action === 'confirmed')?.newValue as SquarePayment | undefined;
    if (confirmed?.id !== payment.id || payment.status !== 'COMPLETED'
      || (intent.invoiceId && !(invoicePayment as { recorded?: boolean })?.recorded)) {
      throw new CaptureError('CAPTURE_REVIEW_REQUIRED');
    }
    const result = { ok: true, retrySafe: false, paymentId: payment.id, status: payment.status, receiptUrl: payment.receipt_url,
      payment, invoicePayment };
    await append(tx, intent, 'settled', result);
    return result;
  });
}

export function squarePaymentMethod(sourceType?: string) {
  const source = sourceType?.toUpperCase() ?? '';
  return source.includes('BANK') ? 'ach' : source.includes('CARD') ? 'credit_card' : 'square';
}
