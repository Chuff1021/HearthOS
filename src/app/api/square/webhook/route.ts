import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { upsertSquarePayment, upsertSquarePaymentByOrderId } from '@/lib/square-payment-store';

const SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
const WEBHOOK_URL = process.env.SQUARE_WEBHOOK_URL;

function verifySignature(body: string, signatureHeader: string | null) {
  if (!SIGNATURE_KEY || !WEBHOOK_URL) return true;
  if (!signatureHeader) return false;

  const digest = crypto
    .createHmac('sha256', SIGNATURE_KEY)
    .update(WEBHOOK_URL + body)
    .digest('base64');

  const a = Buffer.from(digest);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-square-hmacsha256-signature');

    if (!verifySignature(body, signature)) {
      return NextResponse.json({ error: 'Invalid Square webhook signature' }, { status: 401 });
    }

    const payload = JSON.parse(body);
    const eventType = payload?.type as string | undefined;
    const payment = payload?.data?.object?.payment;

    if (!payment?.id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (eventType?.startsWith('payment.') || eventType?.startsWith('refund.')) {
      const amount = Number(payment?.amount_money?.amount || 0) / 100;
      const status = String(payment?.status || 'UNKNOWN');
      const updatedAt = payment?.updated_at || new Date().toISOString();
      const createdAt = payment?.created_at || updatedAt;

      const patch = {
        id: payment.id,
        status,
        amount,
        currency: payment?.amount_money?.currency || 'USD',
        customerName:
          payment?.buyer_email_address ||
          payment?.card_details?.card?.cardholder_name ||
          'Square Customer',
        sourceType: payment?.source_type,
        orderId: payment?.order_id,
        receiptUrl: payment?.receipt_url,
        createdAt,
        updatedAt,
        raw: payload,
      };

      if (payment?.order_id) {
        upsertSquarePaymentByOrderId(payment.order_id, patch);
      } else {
        upsertSquarePayment(patch);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'square-webhook' });
}
