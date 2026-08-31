import { NextResponse } from 'next/server';
import { db, organizations } from '@/db';
import { eq } from 'drizzle-orm';
import { getPaymentIntent } from '@/lib/integrations/payment-intents';
import { getSquareCredentials } from '@/lib/integrations/store';

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const intent = await getPaymentIntent(token);
  if (!intent) return NextResponse.json({ error: 'Payment link is invalid or expired.' }, { status: 404 });

  const [org] = await db.select().from(organizations).where(eq(organizations.id, intent.org_id)).limit(1);
  if (!org) return NextResponse.json({ error: 'Payment account is unavailable.' }, { status: 404 });
  const square = await getSquareCredentials(org);
  if (!square?.locationId) return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });

  return NextResponse.json({
    token,
    invoiceNumber: intent.invoice_number,
    customerName: intent.customer_name,
    buyerEmail: intent.buyer_email,
    amount: Number(intent.amount),
    currency: intent.currency,
    expiresAt: new Date(intent.expires_at).toISOString(),
    square: {
      applicationId: process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID || '',
      locationId: square.locationId,
      environment: square.environment,
    },
  });
}
