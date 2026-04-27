import { NextRequest, NextResponse } from 'next/server';
import { db, bills, billLineItems, vendors, customers } from '@/db';
import { and, eq, asc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateDefaultOrg();

    const [row] = await db
      .select({
        bill: bills,
        vendorId: vendors.id,
        vendorName: vendors.displayName,
        vendorEmail: vendors.email,
        vendorPhone: vendors.phone,
      })
      .from(bills)
      .leftJoin(vendors, eq(vendors.id, bills.vendorId))
      .where(and(eq(bills.orgId, org.id), eq(bills.id, id)))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    const lineItems = await db
      .select({
        line: billLineItems,
        customerName: customers.firstName,
        customerLast: customers.lastName,
        customerCompany: customers.companyName,
      })
      .from(billLineItems)
      .leftJoin(customers, eq(customers.id, billLineItems.customerId))
      .where(eq(billLineItems.billId, id))
      .orderBy(asc(billLineItems.order));

    return NextResponse.json({
      bill: row.bill,
      vendor: row.vendorId ? {
        id: row.vendorId,
        name: row.vendorName,
        email: row.vendorEmail,
        phone: row.vendorPhone,
      } : null,
      lineItems: lineItems.map((li) => ({
        ...li.line,
        customerName: li.customerCompany || (li.customerName ? `${li.customerName} ${li.customerLast || ''}`.trim() : null),
      })),
    });
  } catch (err: any) {
    console.error('Bill detail failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
