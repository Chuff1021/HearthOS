import { authorizeCrmApi } from "@/lib/security/crm-access";
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { recordInvoicePayment } from '@/lib/invoices/record-payment';

export async function POST(request: NextRequest) {
  const accessDenied = await authorizeCrmApi("/api/invoices/payments", "POST");
  if (accessDenied) return accessDenied;
  const invalid = () => NextResponse.json({ error: 'Enter a valid invoice, payment amount, and payment reference.',
    code: 'INVALID_MANUAL_PAYMENT' }, { status: 400 });
  let body;
  try { body = await request.json(); } catch { return invalid(); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid();
  const bounded = (value: unknown, max: number) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
  const invoiceNumber = body.invoiceNumber;
  const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const paymentMethod = body.paymentMethod ?? 'check';
  const checkNumber = body.checkNumber === undefined ? '' : body.checkNumber;
  const amount = typeof body.amount === 'number' || (typeof body.amount === 'string' && /^\d+(\.\d{1,2})?$/.test(body.amount))
    ? Number(body.amount) : NaN;
  const cents = Math.round(amount * 100);
  if (!bounded(invoiceNumber, 50) || !invoiceNumber.trim() || !bounded(paymentMethod, 50) || !paymentMethod.trim()
    || !bounded(checkNumber, 50) || (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 2000))
    || !Number.isSafeInteger(cents) || cents <= 0 || cents > 9_999_999_999 || cents / 100 !== amount
    || (body.invoiceId !== undefined && !uuid(body.invoiceId))
    || (body.requestId !== undefined && !uuid(body.requestId))) return invalid();
  // Preserve historical check identities. Legacy manual clients without a request ID
  // remain compatible, but only clients supplying one can safely retry unknown outcomes.
  const transactionId = checkNumber.trim() ? `check:${invoiceNumber}:${checkNumber.trim()}`
    : `manual:${body.requestId?.toLowerCase() ?? randomUUID()}`;
  if (transactionId.length > 100) return invalid();
  try {
    const notes = [
      paymentMethod === 'check' ? 'Paper check payment recorded manually.' : 'Payment recorded manually.',
      checkNumber.trim() ? `Check number: ${checkNumber.trim()}` : undefined,
      body.notes || undefined,
    ].filter(Boolean).join('\n');

    const result = await recordInvoicePayment({
      invoiceNumber,
      invoiceId: body.invoiceId,
      amount,
      paymentMethod,
      transactionId,
      paidAt: new Date(),
      notes,
    });

    if (!result.recorded) {
      return NextResponse.json({ error: 'Payment recording could not be confirmed. Review this payment before submitting again.',
        code: 'MANUAL_PAYMENT_REVIEW_REQUIRED' }, { status: result.reason === 'recording_failed' ? 503 : 409 });
    }

    return NextResponse.json({ success: true, payment: result });
  } catch {
    return NextResponse.json(
      { error: 'Payment recording could not be confirmed. Review this payment before submitting again.', code: 'MANUAL_PAYMENT_REVIEW_REQUIRED' },
      { status: 503 },
    );
  }
}
