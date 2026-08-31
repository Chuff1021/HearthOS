import { NextRequest, NextResponse } from 'next/server';
import { db, purchaseOrders, purchaseOrderLineItems, vendors } from '@/db';
import { and, eq, asc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { authorizeApi } from '@/lib/tenant/api-authorization';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorizeApi('financials:read');
  if (denied) return denied;
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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorizeApi('financials:write');
  if (denied) return denied;
  try {
    const { id } = await params;
    const org = await getOrCreateDefaultOrg();

    const [existing] = await db
      .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.orgId, org.id), eq(purchaseOrders.id, id)))
      .limit(1);

    if (!existing) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });

    await db.delete(purchaseOrderLineItems).where(eq(purchaseOrderLineItems.purchaseOrderId, id));
    await db.delete(purchaseOrders).where(and(eq(purchaseOrders.orgId, org.id), eq(purchaseOrders.id, id)));

    return NextResponse.json({ success: true, id, poNumber: existing.poNumber });
  } catch (err: any) {
    console.error('PO delete failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed to delete purchase order' }, { status: 500 });
  }
}
