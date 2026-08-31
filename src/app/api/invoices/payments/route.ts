import { NextRequest, NextResponse } from 'next/server';
import { recordInvoicePayment } from '@/lib/invoices/record-payment';
import { requirePermission, tenantErrorResponse } from '@/lib/tenant/context';

export async function POST(request: NextRequest) {
  try {
    await requirePermission('financials:write');
    const body = await request.json();
    const invoiceNumber = body?.invoiceNumber ? String(body.invoiceNumber) : undefined;
    const amount = Number(body?.amount);
    const paymentMethod = body?.paymentMethod ? String(body.paymentMethod) : 'check';
    const checkNumber = body?.checkNumber ? String(body.checkNumber).trim() : '';
    const notes = [
      paymentMethod === 'check' ? 'Paper check payment recorded manually.' : 'Payment recorded manually.',
      checkNumber ? `Check number: ${checkNumber}` : undefined,
      body?.notes ? String(body.notes) : undefined,
    ].filter(Boolean).join('\n');

    if (!invoiceNumber) {
      return NextResponse.json({ error: 'invoiceNumber is required' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 });
    }

    const result = await recordInvoicePayment({
      invoiceNumber,
      amount,
      paymentMethod,
      transactionId: checkNumber ? `check:${invoiceNumber}:${checkNumber}` : undefined,
      paidAt: new Date(),
      notes,
    });

    if (!result.recorded) {
      return NextResponse.json({ error: `Payment not recorded: ${result.reason}` }, { status: 404 });
    }

    return NextResponse.json({ success: true, payment: result });
  } catch (err) {
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to record invoice payment' },
      { status: 500 },
    );
  }
}
