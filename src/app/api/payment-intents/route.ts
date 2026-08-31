import { NextRequest, NextResponse } from 'next/server';
import { and, eq, or } from 'drizzle-orm';
import { customers, db, invoices } from '@/db';
import { createPaymentIntent } from '@/lib/integrations/payment-intents';
import { requirePermission, tenantErrorResponse } from '@/lib/tenant/context';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePermission('financials:write');
    const body = await request.json();
    const reference = String(body.invoiceId || body.invoiceNumber || '').replace(/^QB-/i, '').trim();
    if (!reference) return NextResponse.json({ error: 'Invoice is required.' }, { status: 400 });

    const invoiceFilters = [
      eq(invoices.invoiceNumber, reference),
      eq(invoices.invoiceNumber, `QB-${reference}`),
      eq(invoices.qbInvoiceId, reference),
    ];
    if (isUuid(reference)) invoiceFilters.push(eq(invoices.id, reference));

    const [row] = await db
      .select({
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        qbInvoiceId: invoices.qbInvoiceId,
        balance: invoices.balance,
        totalAmount: invoices.totalAmount,
        firstName: customers.firstName,
        lastName: customers.lastName,
        companyName: customers.companyName,
        email: customers.email,
      })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .where(and(
        eq(invoices.orgId, context.orgId),
        or(...invoiceFilters)!,
      ))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'Invoice was not found.' }, { status: 404 });

    const amount = Number(row.balance || row.totalAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invoice has no payable balance.' }, { status: 400 });
    }
    const customerName = row.companyName || [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Customer';
    const intent = await createPaymentIntent({
      orgId: context.orgId,
      identityId: context.identityId,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber || row.qbInvoiceId || reference,
      customerName,
      buyerEmail: row.email,
      amount,
      expiresInDays: Number(body.expiresInDays || 14),
    });
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    return NextResponse.json({
      id: intent.id,
      expiresAt: intent.expiresAt.toISOString(),
      url: `${origin.replace(/\/$/, '')}/pay?token=${encodeURIComponent(intent.token)}`,
    }, { status: 201 });
  } catch (error) {
    const tenantResponse = tenantErrorResponse(error);
    if (tenantResponse) return tenantResponse;
    console.error('Failed to create payment intent:', error);
    return NextResponse.json({ error: 'Failed to create secure payment link.' }, { status: 500 });
  }
}
