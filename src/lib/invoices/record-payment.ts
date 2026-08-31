import { and, eq, or } from 'drizzle-orm';
import { db, customers, invoices, organizations, payments } from '@/db';
import { getJob, updateJobRecord } from '@/lib/job-store';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { getClientFromTokens } from '@/lib/quickbooks/sync';
import { getQuickBooksCredentials, saveQuickBooksRefresh } from '@/lib/integrations/store';

type RecordInvoicePaymentInput = {
  orgId?: string;
  invoiceNumber?: string;
  amount: number;
  paymentMethod: string;
  transactionId?: string;
  paidAt?: Date;
  notes?: string;
};

type InvoicePaymentRow = {
  invoice: typeof invoices.$inferSelect;
  qbCustomerId: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanInvoiceNumber(value: string | undefined) {
  return (value || '').replace(/^QB-/i, '').trim();
}

function moneyNumber(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function paidDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function findInvoice(
  orgId: string,
  reference: string,
  amount: number,
): Promise<InvoicePaymentRow | null> {
  const filters = [
    eq(invoices.qbInvoiceId, reference),
    eq(invoices.invoiceNumber, reference),
    eq(invoices.invoiceNumber, `QB-${reference}`),
  ];
  if (isUuid(reference)) filters.push(eq(invoices.id, reference));

  const directRows = await db
    .select({
      invoice: invoices,
      qbCustomerId: customers.qbCustomerId,
    })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(eq(invoices.orgId, orgId), or(...filters)!))
    .limit(1);
  if (directRows[0]) return directRows[0];

  if (!isUuid(reference)) return null;
  const job = await getJob(reference, orgId);
  if (!job) return null;

  const linkedReferences = [job.linkedInvoiceId, job.linkedDocumentNumber]
    .map((value) => cleanInvoiceNumber(value))
    .filter((value) => Boolean(value) && value !== reference);
  for (const linkedReference of linkedReferences) {
    const linked: InvoicePaymentRow | null = await findInvoice(orgId, linkedReference, amount);
    if (linked) return linked;
  }

  if (!isUuid(job.customerId)) return null;
  const candidates = await db
    .select({
      invoice: invoices,
      qbCustomerId: customers.qbCustomerId,
    })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(
      eq(invoices.orgId, orgId),
      eq(invoices.customerId, job.customerId),
      eq(invoices.issueDate, job.scheduledDate),
    ));

  const exactAmount = candidates.filter(
    (candidate) => Math.abs(moneyNumber(candidate.invoice.totalAmount) - amount) < 0.01,
  );
  const match = exactAmount.length === 1 ? exactAmount[0] : candidates.length === 1 ? candidates[0] : null;
  if (!match) return null;

  await updateJobRecord(job.id, {
    linkedInvoiceId: match.invoice.id,
    linkedDocumentNumber: match.invoice.invoiceNumber,
    totalAmount: moneyNumber(match.invoice.totalAmount),
  }, orgId);
  return match;
}

async function createQuickBooksPayment(input: {
  org: typeof organizations.$inferSelect;
  invoice: typeof invoices.$inferSelect;
  qbCustomerId?: string | null;
  amount: number;
  paidAt: Date;
  note: string;
}) {
  const credentials = await getQuickBooksCredentials(input.org);
  if (!credentials) return null;
  if (!input.invoice.qbInvoiceId || !input.qbCustomerId) return null;

  const client = getClientFromTokens(credentials.accessToken, credentials.refreshToken, credentials.realmId);
  const payload = {
    CustomerRef: { value: input.qbCustomerId },
    TotalAmt: input.amount,
    TxnDate: paidDateString(input.paidAt),
    PrivateNote: input.note,
    Line: [
      {
        Amount: input.amount,
        LinkedTxn: [
          {
            TxnId: input.invoice.qbInvoiceId,
            TxnType: 'Invoice',
          },
        ],
      },
    ],
  };

  try {
    return await client.createPayment(payload as any);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (!message.includes('AuthenticationFailed') && !message.includes('Token expired') && !message.includes('401')) {
      throw err;
    }

    const refreshed = await client.refreshAccessToken();
    await saveQuickBooksRefresh({
      orgId: input.org.id,
      realmId: credentials.realmId,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || credentials.refreshToken,
      expiresIn: refreshed.expires_in,
    });

    return await client.createPayment(payload as any);
  }
}

export async function recordInvoicePayment(input: RecordInvoicePaymentInput) {
  const invoiceNumber = cleanInvoiceNumber(input.invoiceNumber);
  if (!invoiceNumber) return { recorded: false, reason: 'missing_invoice_number' as const };

  const amount = moneyNumber(input.amount);
  if (amount <= 0) return { recorded: false, reason: 'invalid_amount' as const };

  const org = input.orgId
    ? (await db.select().from(organizations).where(eq(organizations.id, input.orgId)).limit(1))[0]
    : await getOrCreateDefaultOrg();
  if (!org) return { recorded: false, reason: 'organization_not_found' as const };
  const row = await findInvoice(org.id, invoiceNumber, amount);

  if (!row) return { recorded: false, reason: 'invoice_not_found' as const };

  const paidAt = input.paidAt || new Date();
  const existing = input.transactionId
    ? await db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.invoiceId, row.invoice.id), eq(payments.transactionId, input.transactionId)))
        .limit(1)
    : [];

  let qbPaymentId: string | undefined;
  let qbNote = '';
  if (existing.length === 0) {
    try {
      const qbPayment = await createQuickBooksPayment({
        org,
        invoice: row.invoice,
        qbCustomerId: row.qbCustomerId,
        amount,
        paidAt,
        note: input.notes || `${input.paymentMethod} payment`,
      });
      qbPaymentId = qbPayment?.Id;
    } catch (err) {
      qbNote = ` QuickBooks payment sync failed: ${err instanceof Error ? err.message : 'unknown error'}`;
      console.error('Failed to create QuickBooks payment for invoice:', err);
    }

    await db.insert(payments).values({
      orgId: org.id,
      invoiceId: row.invoice.id,
      qbPaymentId,
      amount: amount.toFixed(2),
      paymentMethod: input.paymentMethod,
      transactionId: input.transactionId,
      paidAt,
      notes: `${input.notes || ''}${qbNote}`.trim() || undefined,
    });
  }

  const paymentRows = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(eq(payments.invoiceId, row.invoice.id));

  const paidTotal = paymentRows.reduce((sum, payment) => sum + moneyNumber(payment.amount), 0);
  const total = moneyNumber(row.invoice.totalAmount);
  const balance = Math.max(0, total - paidTotal);
  const isPaid = balance <= 0.004 && total > 0;

  await db.update(invoices).set({
    balance: balance.toFixed(2),
    status: isPaid ? 'paid' : 'sent',
    paidAt: isPaid ? paidAt : row.invoice.paidAt,
    updatedAt: new Date(),
  }).where(eq(invoices.id, row.invoice.id));

  return {
    recorded: true,
    invoiceId: row.invoice.id,
    invoiceNumber: row.invoice.invoiceNumber,
    balance,
    paid: isPaid,
    qbPaymentId,
  };
}
