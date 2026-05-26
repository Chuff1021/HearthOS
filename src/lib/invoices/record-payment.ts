import { and, eq, or } from 'drizzle-orm';
import { db, customers, invoices, organizations, payments } from '@/db';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { getClientFromTokens } from '@/lib/quickbooks/sync';

type RecordInvoicePaymentInput = {
  invoiceNumber?: string;
  amount: number;
  paymentMethod: string;
  transactionId?: string;
  paidAt?: Date;
  notes?: string;
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

async function createQuickBooksPayment(input: {
  org: typeof organizations.$inferSelect;
  invoice: typeof invoices.$inferSelect;
  qbCustomerId?: string | null;
  amount: number;
  paidAt: Date;
  note: string;
}) {
  if (!input.org.qbAccessToken || !input.org.qbRefreshToken || !input.org.qbRealmId) return null;
  if (!input.invoice.qbInvoiceId || !input.qbCustomerId) return null;

  const client = getClientFromTokens(input.org.qbAccessToken, input.org.qbRefreshToken, input.org.qbRealmId);
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
    await db.update(organizations).set({
      qbAccessToken: refreshed.access_token,
      qbRefreshToken: refreshed.refresh_token || input.org.qbRefreshToken,
      qbTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      updatedAt: new Date(),
    }).where(eq(organizations.id, input.org.id));

    return await client.createPayment(payload as any);
  }
}

export async function recordInvoicePayment(input: RecordInvoicePaymentInput) {
  const invoiceNumber = cleanInvoiceNumber(input.invoiceNumber);
  if (!invoiceNumber) return { recorded: false, reason: 'missing_invoice_number' as const };

  const amount = moneyNumber(input.amount);
  if (amount <= 0) return { recorded: false, reason: 'invalid_amount' as const };

  const org = await getOrCreateDefaultOrg();
  const filters = [
    eq(invoices.qbInvoiceId, invoiceNumber),
    eq(invoices.invoiceNumber, invoiceNumber),
    eq(invoices.invoiceNumber, `QB-${invoiceNumber}`),
  ];
  if (isUuid(invoiceNumber)) filters.push(eq(invoices.id, invoiceNumber));

  const [row] = await db
    .select({
      invoice: invoices,
      qbCustomerId: customers.qbCustomerId,
    })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(eq(invoices.orgId, org.id), or(...filters)!))
    .limit(1);

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
