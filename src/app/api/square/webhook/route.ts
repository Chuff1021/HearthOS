import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { recordInvoicePayment } from '@/lib/invoices/record-payment';
import { listSquarePayments, upsertSquarePayment, upsertSquarePaymentByOrderId } from '@/lib/square-payment-store';
import { CaptureError, getCaptureIntent, observeCapture, projectLegacySquarePayment, resolveSquareInvoice, settleCapture,
  squareOrganization, squarePaymentMethod, validateSquarePayment } from '@/lib/invoices/square-capture-intent';

function verifySignature(body: string, signature: string | null) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const url = process.env.SQUARE_WEBHOOK_URL;
  const environment = process.env.SQUARE_ENVIRONMENT || 'production';
  if (!key || !url || !process.env.SQUARE_LOCATION_ID || !['production', 'sandbox'].includes(environment) || !signature) return false;
  const expected = Buffer.from(createHmac('sha256', key).update(url + body).digest('base64'));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    if (!verifySignature(body, request.headers.get('x-square-hmacsha256-signature'))) {
      return NextResponse.json({ error: 'Invalid Square webhook signature' }, { status: 401 });
    }
    let payload;
    try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: 'Invalid webhook.' }, { status: 400 }); }
    if (typeof payload?.type !== 'string' || !payload.type.startsWith('payment.')) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const payment = validateSquarePayment(payload?.data?.object?.payment, process.env.SQUARE_LOCATION_ID!);
    if (!payment) return NextResponse.json({ error: 'Invalid Square payment.' }, { status: 400 });

    // No database or file-store access occurs before signature and payment validation.
    const orgId = await squareOrganization();
    const intent = payment.reference_id?.startsWith('hos_') ? await getCaptureIntent(orgId, payment.reference_id) : null;
    if (intent && !validateSquarePayment(payment, process.env.SQUARE_LOCATION_ID!, intent)) {
      return NextResponse.json({ error: 'Payment does not match its capture intent.' }, { status: 409 });
    }
    const previous = listSquarePayments().find(row => row.id === payment.id
      || (!intent && payment.order_id && row.orderId === payment.order_id));
    const reference = intent ? undefined : payment.reference_id || previous?.invoiceNumber;
    const invoice = intent?.invoiceId ? { id: intent.invoiceId, invoiceNumber: intent.invoiceNumber ?? undefined }
      : reference ? await resolveSquareInvoice(orgId, reference) : null;
    const project = () => {
      const current = listSquarePayments().find(row => row.id === payment.id
        || (!intent && payment.order_id && row.orderId === payment.order_id));
      if (current?.status === 'COMPLETED' && payment.status !== 'COMPLETED') return;
      const patch = { id: payment.id, status: payment.status, amount: payment.amount_money.amount / 100,
        currency: payment.amount_money.currency, invoiceNumber: invoice?.invoiceNumber,
        sourceType: payment.source_type, orderId: payment.order_id, receiptUrl: payment.receipt_url,
        createdAt: payment.created_at || current?.createdAt || new Date().toISOString(),
        updatedAt: payment.updated_at || new Date().toISOString() };
      if (!intent && payment.order_id) upsertSquarePaymentByOrderId(payment.order_id, patch);
      else upsertSquarePayment(patch);
    };
    const confirmed = intent ? (await observeCapture(intent, payment, project)) === 'confirmed' : payment.status === 'COMPLETED';
    if (!intent) await projectLegacySquarePayment(orgId, project);
    if (confirmed) {
      const invoicePayment = invoice ? await recordInvoicePayment({ orgId, invoiceId: invoice.id,
        amount: (intent?.principalCents ?? payment.amount_money.amount) / 100, paymentMethod: squarePaymentMethod(payment.source_type),
        transactionId: payment.id, paidAt: payment.created_at ? new Date(payment.created_at) : undefined,
        notes: `Square payment ${payment.id}` }) : undefined;
      if (invoice && !invoicePayment?.recorded) return NextResponse.json({ error: 'Payment recording needs review.' }, { status: 409 });
      if (intent) await settleCapture(intent, payment, invoicePayment);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Webhook processing needs review.' }, { status: error instanceof CaptureError ? error.status : 503 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'square-webhook' });
}
