import { NextRequest, NextResponse } from 'next/server';
import { authorizeCrmApi } from '@/lib/security/crm-access';
import { verifyCustomerLink } from '@/lib/security/public-links';
import { recordInvoicePayment } from '@/lib/invoices/record-payment';
import { listSquarePayments, upsertSquarePayment } from '@/lib/square-payment-store';
import { CaptureError, dollarsToCents, observeCapture, replaySettledCapture, reserveCapture, settleCapture,
  squareOrganization, squarePaymentMethod, validateSquarePayment,
  type CaptureIntent, type SquarePayment } from '@/lib/invoices/square-capture-intent';

function review() {
  return NextResponse.json({ ok: false, retrySafe: false, code: 'CAPTURE_REVIEW_REQUIRED',
    error: 'Payment needs review. Do not submit another payment; contact the office.' }, { status: 409 });
}

async function completeRecordedCapture(intent: CaptureIntent, payment: SquarePayment) {
  const invoicePayment = intent.invoiceId ? await recordInvoicePayment({ orgId: intent.orgId, invoiceId: intent.invoiceId,
    amount: intent.principalCents / 100, paymentMethod: squarePaymentMethod(payment.source_type),
    transactionId: payment.id, paidAt: payment.created_at ? new Date(payment.created_at) : undefined,
    notes: `Square payment ${payment.id}` }) : undefined;
  if (intent.invoiceId && !invoicePayment?.recorded) return review();
  return NextResponse.json(await settleCapture(intent, payment, invoicePayment));
}

export async function POST(request: NextRequest) {
  let reserved = false;
  try {
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId = process.env.SQUARE_LOCATION_ID;
    const environment = process.env.SQUARE_ENVIRONMENT || 'production';
    if (!accessToken || !locationId || !['production', 'sandbox'].includes(environment)) {
      return NextResponse.json({ retrySafe: true, error: 'Square is not configured.' }, { status: 503 });
    }
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ retrySafe: true, error: 'Invalid payment request.' }, { status: 400 }); }
    const amountCents = dollarsToCents(body?.amount);
    const principalCents = body?.invoicePrincipal === undefined ? amountCents : dollarsToCents(body.invoicePrincipal);
    const sourceId = body?.sourceId;
    const invoiceNumber = body?.invoiceNumber;
    if (!body || Array.isArray(body) || amountCents === null || principalCents === null || typeof sourceId !== 'string'
      || !sourceId.trim() || sourceId.length > 4096 || ['CASH', 'EXTERNAL'].includes(sourceId.toUpperCase())
      || (invoiceNumber !== undefined && (typeof invoiceNumber !== 'string' || !invoiceNumber.trim() || invoiceNumber.length > 100))
      || (body.token !== undefined && (typeof body.token !== 'string' || body.token.length > 2048))
      || ['customerName', 'buyerEmail', 'note'].some(key => body[key] !== undefined
        && (typeof body[key] !== 'string' || body[key].length > (key === 'note' ? 400 : 254)))) {
      return NextResponse.json({ retrySafe: true, error: 'Invalid payment request.' }, { status: 400 });
    }
    const claims = verifyCustomerLink(body.token || '', 'payment', invoiceNumber || '');
    if (!claims) {
      const denied = await authorizeCrmApi('/api/square/payments', 'POST');
      if (denied) return NextResponse.json({ retrySafe: true, error: 'This payment link is invalid or expired.' }, { status: 403 });
    } else if (!invoiceNumber || amountCents > claims.maxCents!) {
      return NextResponse.json({ retrySafe: true, error: 'Payment exceeds the amount authorized by this link.' }, { status: 400 });
    }
    const orgId = await squareOrganization();
    const reservation = await reserveCapture({ orgId, locationId, sourceId, amountCents, principalCents, invoiceNumber,
      ...(claims ? { token: body.token, maxCents: claims.maxCents } : {}) });
    const { intent } = reservation;
    if (!reservation.fresh) {
      if (!reservation.result) return review();
      reserved = true;
      return NextResponse.json(await replaySettledCapture(intent, reservation.result));
    }
    reserved = true;
    const base = environment === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
    const response = await fetch(`${base}/v2/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`,
        'Square-Version': '2024-12-18' }, cache: 'no-store', signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ idempotency_key: intent.id, source_id: sourceId, autocomplete: true,
        location_id: locationId, amount_money: { amount: amountCents, currency: 'USD' },
        reference_id: `hos_${intent.id}`,
        note: [reservation.invoiceNumber ? `HearthOS payment for ${reservation.invoiceNumber}` : 'HearthOS payment', body.note].filter(Boolean).join('\n'),
        buyer_email_address: body.buyerEmail }),
    });
    let data;
    try { data = await response.json(); } catch { return review(); }
    const payment = validateSquarePayment(data?.payment, locationId, intent);
    if (!response.ok) {
      // Timeouts, conflicts, server failures and malformed responses stay reserved.
      const rejected = !data?.payment && [400, 401, 403, 404, 422].includes(response.status)
        && Array.isArray(data?.errors) && data.errors.length > 0 && data.errors.length <= 20
        && data.errors.every((error: { category?: unknown; code?: unknown }) => error
          && typeof error.category === 'string' && ['INVALID_REQUEST_ERROR', 'AUTHENTICATION_ERROR', 'PAYMENT_METHOD_ERROR'].includes(error.category)
          && typeof error.code === 'string' && /^[A-Z_]{1,100}$/.test(error.code));
      let outcome;
      if (payment && ['FAILED', 'CANCELED'].includes(payment.status)) outcome = await observeCapture(intent, payment);
      else if (rejected) outcome = await observeCapture(intent, null);
      else return review();
      if (outcome !== 'released') return review();
      return NextResponse.json({ ok: false, retrySafe: true, error: 'Square rejected the payment.',
        ...(payment ? { paymentId: payment.id, status: payment.status, payment } : {}) }, { status: 402 });
    }
    if (!payment || data?.errors?.length) return review();
    const confirmed = await observeCapture(intent, payment, () => {
      const previous = listSquarePayments().find(row => row.id === payment.id);
      if (previous?.status === 'COMPLETED' && payment.status !== 'COMPLETED') return;
      upsertSquarePayment({ id: payment.id, status: payment.status, amount: payment.amount_money.amount / 100,
        currency: payment.amount_money.currency, invoiceNumber: reservation.invoiceNumber,
        customerName: body.customerName || 'Customer', sourceType: payment.source_type, orderId: payment.order_id,
        receiptUrl: payment.receipt_url, createdAt: payment.created_at || new Date().toISOString(),
        updatedAt: payment.updated_at || new Date().toISOString() });
    });
    if (confirmed !== 'confirmed') {
      if (confirmed === 'ignored') return review();
      if (['FAILED', 'CANCELED'].includes(payment.status)) return NextResponse.json({ ok: false, retrySafe: true,
        paymentId: payment.id, status: payment.status, payment, error: 'Square rejected the payment.' }, { status: 402 });
      return NextResponse.json({ ok: false, retrySafe: false, code: 'CAPTURE_PENDING', paymentId: payment.id,
        status: payment.status, receiptUrl: payment.receipt_url, payment,
        error: 'Payment submitted and awaiting confirmation. Do not submit another payment.' }, { status: 409 });
    }
    return await completeRecordedCapture(intent, payment);
  } catch (error) {
    if (reserved) return review();
    if (error instanceof CaptureError) return NextResponse.json({ ok: false, code: error.code,
      retrySafe: !['CAPTURE_REVIEW_REQUIRED', 'CAPTURE_INTENT_CONFLICT', 'INVOICE_BALANCE_RESERVED',
        'INVOICE_CAPTURE_PENDING', 'ADHOC_CAPTURE_PENDING', 'INVOICE_PAYMENT_REVIEW_REQUIRED', 'PAYMENT_LINK_LIMIT'].includes(error.code),
      error: 'Payment cannot proceed. Contact the office before trying again.' }, { status: error.status });
    return NextResponse.json({ ok: false, retrySafe: false, error: 'Payment could not be started.' }, { status: 503 });
  }
}
