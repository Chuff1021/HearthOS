import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { recordInvoicePayment } from '@/lib/invoices/record-payment';
import { upsertSquarePayment, upsertSquarePaymentByOrderId } from '@/lib/square-payment-store';
import { getIntegrationConnectionByExternalAccount, isTenantIntegrationsEnabled } from '@/lib/integrations/store';
import { db, organizations } from '@/db';
import { eq } from 'drizzle-orm';

const SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
const WEBHOOK_URL = process.env.SQUARE_WEBHOOK_URL;

function verifySignature(body: string, signatureHeader: string | null) {
  if (!SIGNATURE_KEY || !WEBHOOK_URL) return false;
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

function paymentMethodFromSquare(sourceType: string | undefined) {
  const source = String(sourceType || '').toUpperCase();
  if (source.includes('BANK')) return 'ach';
  if (source.includes('CARD')) return 'credit_card';
  return source.toLowerCase() || 'square';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-square-hmacsha256-signature');

    if (!verifySignature(body, signature)) {
      return NextResponse.json({ error: 'Invalid Square webhook signature' }, { status: 401 });
    }

    const payload = JSON.parse(body);
    const merchantId = String(payload?.merchant_id || payload?.data?.object?.payment?.merchant_id || '');
    const orgId = isTenantIntegrationsEnabled()
      ? (merchantId
          ? (await getIntegrationConnectionByExternalAccount('square', merchantId))?.orgId
          : undefined)
      : (await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, 'default')).limit(1))[0]?.id;
    if (!orgId) {
      return NextResponse.json({ error: 'Square merchant is not connected to an organization' }, { status: 404 });
    }
    const storageScope = { orgId, trustedSystem: true as const };
    const eventType = payload?.type as string | undefined;
    const payment = payload?.data?.object?.payment;

    if (!payment?.id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (eventType?.startsWith('payment.') || eventType?.startsWith('refund.')) {
      const amount = Number(payment?.amount_money?.amount || 0) / 100;
      const status = String(payment?.status || 'UNKNOWN');
      const sourceType = payment?.source_type;
      const invoiceNumber = payment?.reference_id ? String(payment.reference_id) : undefined;
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
        invoiceNumber,
        sourceType,
        orderId: payment?.order_id,
        receiptUrl: payment?.receipt_url,
        createdAt,
        updatedAt,
        raw: payload,
      };

      if (payment?.order_id) {
        await upsertSquarePaymentByOrderId(payment.order_id, patch, storageScope);
      } else {
        await upsertSquarePayment(patch, storageScope);
      }

      if (invoiceNumber && status.toUpperCase() === 'COMPLETED') {
        await recordInvoicePayment({
          orgId,
          invoiceNumber,
          amount,
          paymentMethod: paymentMethodFromSquare(sourceType),
          transactionId: payment.id,
          paidAt: new Date(createdAt),
          notes: [
            `Square ${sourceType || 'payment'} webhook ${payment.id}`.trim(),
            `Status: ${status}`,
            payment?.receipt_url ? `Receipt: ${payment.receipt_url}` : undefined,
            payment?.buyer_email_address ? `Buyer email: ${payment.buyer_email_address}` : undefined,
          ].filter(Boolean).join('\n'),
        });
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
