import { NextRequest, NextResponse } from 'next/server';
import { db, customers, invoices, payments } from '@/db';
import { and, eq, desc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/customers/[id]
// Customer detail + unified invoice + payment timeline.

type TxnType = 'invoice' | 'payment';
type Txn = {
  type: TxnType;
  id: string;
  number: string | null;
  date: string | null;
  status: string | null;
  total: number;
  balance: number;
  paymentMethod?: string | null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(500, Math.max(20, parseInt(searchParams.get('limit') || '200', 10)));
    const typeFilter = (searchParams.get('type') || 'all').toLowerCase();

    const org = await getOrCreateDefaultOrg();

    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, org.id), eq(customers.id, id)))
      .limit(1);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    const txns: Txn[] = [];

    if (typeFilter !== 'payment') {
      const invRows = await db
        .select({
          id: invoices.id,
          number: invoices.invoiceNumber,
          date: invoices.issueDate,
          dueDate: invoices.dueDate,
          status: invoices.status,
          total: invoices.totalAmount,
          balance: invoices.balance,
        })
        .from(invoices)
        .where(and(eq(invoices.orgId, org.id), eq(invoices.customerId, id)))
        .orderBy(desc(invoices.issueDate))
        .limit(limit);
      for (const i of invRows) {
        txns.push({
          type: 'invoice',
          id: i.id,
          number: i.number,
          date: i.date,
          status: i.status,
          total: Number(i.total ?? 0),
          balance: Number(i.balance ?? 0),
        });
      }
    }

    if (typeFilter !== 'invoice') {
      // Payments are linked to invoices, which are linked to customers.
      const payRows = await db
        .select({
          id: payments.id,
          paidAt: payments.paidAt,
          amount: payments.amount,
          paymentMethod: payments.paymentMethod,
          invoiceId: payments.invoiceId,
          invoiceNumber: invoices.invoiceNumber,
        })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .where(and(eq(payments.orgId, org.id), eq(invoices.customerId, id)))
        .orderBy(desc(payments.paidAt))
        .limit(limit);
      for (const p of payRows) {
        txns.push({
          type: 'payment',
          id: p.id,
          number: p.invoiceNumber ? `Pmt → #${p.invoiceNumber}` : 'Payment',
          date: p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : null,
          status: 'received',
          total: Number(p.amount ?? 0),
          balance: 0,
          paymentMethod: p.paymentMethod,
        });
      }
    }

    txns.sort((a, b) => {
      const ax = a.date ? new Date(a.date).getTime() : -Infinity;
      const bx = b.date ? new Date(b.date).getTime() : -Infinity;
      return bx - ax;
    });

    const invRoll = txns.filter((t) => t.type === 'invoice');
    const payRoll = txns.filter((t) => t.type === 'payment');

    const displayName =
      customer.companyName ||
      [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() ||
      customer.email ||
      'Unnamed';

    return NextResponse.json({
      customer: {
        ...customer,
        displayName,
        balance: 0, // computed below
      },
      summary: {
        invoiceCount: invRoll.length,
        openInvoiceCount: invRoll.filter((t) => t.balance > 0).length,
        invoiceOpenBalance: invRoll.reduce((s, t) => s + (t.balance || 0), 0),
        invoiceTotalBilled: invRoll.reduce((s, t) => s + (t.total || 0), 0),
        paymentCount: payRoll.length,
        totalReceived: payRoll.reduce((s, t) => s + (t.total || 0), 0),
        lastActivity: txns[0]?.date ?? null,
      },
      transactions: txns,
    });
  } catch (err: any) {
    console.error('Customer detail failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
