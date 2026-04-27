import { NextRequest, NextResponse } from 'next/server';
import { db, purchaseOrders, purchaseOrderLineItems, vendors } from '@/db';
import { and, eq, asc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateDefaultOrg();

    const [row] = await db
      .select({
        po: purchaseOrders,
        vendorId: vendors.id,
        vendorName: vendors.displayName,
        vendorEmail: vendors.email,
        vendorPhone: vendors.phone,
      })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(and(eq(purchaseOrders.orgId, org.id), eq(purchaseOrders.id, id)))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });

    const lineItems = await db
      .select()
      .from(purchaseOrderLineItems)
      .where(eq(purchaseOrderLineItems.purchaseOrderId, id))
      .orderBy(asc(purchaseOrderLineItems.order));

    return NextResponse.json({
      purchaseOrder: row.po,
      vendor: row.vendorId ? {
        id: row.vendorId,
        name: row.vendorName,
        email: row.vendorEmail,
        phone: row.vendorPhone,
      } : null,
      lineItems,
    });
  } catch (err: any) {
    console.error('PO detail failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
