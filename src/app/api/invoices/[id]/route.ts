import { NextRequest, NextResponse } from 'next/server';
import { db, invoices, invoiceLineItems, customers, payments } from '@/db';
import { and, eq, asc, desc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateDefaultOrg();

    const [row] = await db
      .select({
        invoice: invoices,
        customerId: customers.id,
        customerFirst: customers.firstName,
        customerLast: customers.lastName,
        customerCompany: customers.companyName,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .where(and(eq(invoices.orgId, org.id), eq(invoices.id, id)))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const lineItems = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id))
      .orderBy(asc(invoiceLineItems.order));

    const appliedPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, id))
      .orderBy(desc(payments.paidAt));

    const customerName = row.customerCompany || (row.customerFirst ? `${row.customerFirst} ${row.customerLast || ''}`.trim() : null);

    return NextResponse.json({
      invoice: row.invoice,
      customer: row.customerId ? {
        id: row.customerId,
        name: customerName,
        email: row.customerEmail,
        phone: row.customerPhone,
      } : null,
      lineItems,
      payments: appliedPayments,
    });
  } catch (err: any) {
    console.error('Invoice detail failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
