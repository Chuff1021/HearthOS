import { getOrCreateDefaultOrg } from '@/lib/org';
import { getClientFromTokens } from '@/lib/quickbooks/sync';
import {
  PaymentRecordingError, paymentCents, preparePayment, completePaymentExport, persistPaymentTokens,
} from './payment-recording-store';

type RecordInvoicePaymentInput = {
  invoiceNumber?: string;
  invoiceId?: string;
  orgId?: string;
  // Invoice allocation supplied by the caller. Square retains gross/fee in its durable intent.
  amount: number;
  paymentMethod: string;
  transactionId?: string;
  paidAt?: Date;
  notes?: string;
};

export async function recordInvoicePayment(input: RecordInvoicePaymentInput) {
  const invoiceNumber = typeof input.invoiceNumber === 'string' ? input.invoiceNumber.trim() : '';
  if (!invoiceNumber && !input.invoiceId) return { recorded: false as const, reason: 'missing_invoice_number' };
  // Square's provider identity is mandatory. Never manufacture an identity for a callback.
  if (typeof input.transactionId !== 'string' || !input.transactionId.trim()
    || input.transactionId !== input.transactionId.trim() || input.transactionId.length > 100
    || /[\u0000-\u001f\u007f]/.test(input.transactionId)) {
    return { recorded: false as const, reason: 'invalid_transaction_id' };
  }
  const cents = typeof input.amount === 'number' ? Math.round(input.amount * 100) : NaN;
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 9_999_999_999 || cents / 100 !== input.amount) {
    return { recorded: false as const, reason: 'invalid_amount' };
  }
  const paidAt = input.paidAt ?? new Date();
  if (!(paidAt instanceof Date) || !Number.isFinite(paidAt.getTime())) {
    return { recorded: false as const, reason: 'invalid_paid_at' };
  }
  if (typeof input.paymentMethod !== 'string' || !input.paymentMethod.trim() || input.paymentMethod.length > 50) {
    return { recorded: false as const, reason: 'invalid_payment_method' };
  }

  let local: Awaited<ReturnType<typeof preparePayment>>;
  try {
    const orgId = input.orgId ?? (await getOrCreateDefaultOrg()).id;
    local = await preparePayment({ orgId, invoiceNumber, invoiceId: input.invoiceId, cents, transactionId: input.transactionId,
      paidAt, paymentMethod: input.paymentMethod, notes: input.notes });
  } catch (error) {
    return { recorded: false as const,
      reason: error instanceof PaymentRecordingError ? error.code : 'recording_failed' };
  }

  const result = { recorded: true as const, invoiceId: local.invoice.id,
    invoiceNumber: local.invoice.invoiceNumber, balance: local.balance, paid: local.paid,
    qbPaymentId: local.qbPaymentId, qbExportStatus: local.status, qbExportNote: local.note,
    tokenPersistenceStatus: 'unchanged' as 'unchanged' | 'saved' | 'review_required' };
  if (!local.shouldExport) return result;

  let client: ReturnType<typeof getClientFromTokens> | undefined;
  try {
    client = getClientFromTokens(local.org.qbAccessToken!, local.org.qbRefreshToken!, local.org.qbRealmId!);
    // The client alone owns explicit-401 refresh. Unknown outcomes never replay here.
    const payload = {
      CustomerRef: { value: local.qbCustomerId! }, TotalAmt: cents / 100,
      TxnDate: paidAt.toISOString().slice(0, 10),
      PrivateNote: `HearthOS payment: ${local.payment.id}\n${input.notes || `${input.paymentMethod} payment`}`,
      Line: [{ Amount: cents / 100, LinkedTxn: [{ TxnId: local.invoice.qbInvoiceId!, TxnType: 'Invoice' }] }],
    };
    // The shared response type requires CustomerRef.name; existing create payloads use its ID only.
    const response = await client.createPayment(payload as unknown as Parameters<typeof client.createPayment>[0]);
    const rawLinks = response?.Line?.[0]?.LinkedTxn;
    const links = Array.isArray(rawLinks) ? rawLinks : rawLinks && typeof rawLinks === 'object' ? [rawLinks] : [];
    if (!response || typeof response.Id !== 'string' || !/^[0-9]{1,50}$/.test(response.Id)
      || paymentCents(String(response.TotalAmt)) !== cents
      || (response.UnappliedAmt !== undefined && paymentCents(String(response.UnappliedAmt)) !== 0)
      || response.CustomerRef?.value !== local.qbCustomerId
      || response.Line?.length !== 1 || paymentCents(String(response.Line[0].Amount)) !== cents
      || links.length !== 1 || typeof links[0]?.TxnId !== 'string' || !/^[0-9]{1,50}$/.test(links[0].TxnId)
      || links[0].TxnId !== local.invoice.qbInvoiceId || links[0].TxnType !== 'Invoice') {
      throw new PaymentRecordingError('export_review_required');
    }
    await completePaymentExport(local, response.Id);
    result.qbPaymentId = response.Id;
    result.qbExportStatus = 'exported';
    result.qbExportNote = 'QuickBooks export completed.';
  } catch {
    result.qbExportStatus = 'review_required';
    result.qbExportNote = 'Local payment recorded. QuickBooks export is unresolved and needs review; do not resubmit.';
  } finally {
    // Token persistence must not erase a known export result or mask an unknown one.
    try {
      const tokens = client?.getTokens();
      if (tokens && (tokens.access_token !== local.org.qbAccessToken || tokens.refresh_token !== local.org.qbRefreshToken)) {
        result.tokenPersistenceStatus = await persistPaymentTokens(local.org, tokens) ? 'saved' : 'review_required';
      }
    } catch {
      result.tokenPersistenceStatus = 'review_required';
    }
    if (result.tokenPersistenceStatus === 'review_required') {
      result.qbExportNote += ' QuickBooks connection credentials need review.';
      console.error('Payment token persistence needs review.');
    }
  }
  return result;
}
