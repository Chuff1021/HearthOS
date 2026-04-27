import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  inventoryItems,
  invoices,
  invoiceLineItems,
  purchaseOrders,
  purchaseOrderLineItems,
  bills,
  billLineItems,
} from '@/db';
import { and, eq, sql, isNotNull, isNull, inArray, notInArray, or } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// POST /api/inventory/trim
// Mark inventory items as untracked if they have no recent activity.
// Body: {
//   monthsBack?: 24,
//   includeInvoices?: true,
//   includePurchaseOrders?: true,
//   includeBills?: false,
//   dryRun?: true
// }
//
// Items with activity in the window become tracked = true.
// Items WITHOUT activity become tracked = false.
// (Both directions: re-running with a wider window can re-track items.)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const monthsBack = Math.max(1, Math.min(120, Number(body.monthsBack) || 24));
    const includeInvoices = body.includeInvoices !== false; // default true
    const includePOs = body.includePurchaseOrders !== false; // default true
    const includeBills = !!body.includeBills; // default false
    const dryRun = body.dryRun !== false; // default true (preview mode)

    const org = await getOrCreateDefaultOrg();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Collect qb_item_ids that show up on any selected source within the window.
    const activeIds = new Set<string>();

    if (includeInvoices) {
      const rows = await db
        .selectDistinct({ qbItemId: invoiceLineItems.qbItemId })
        .from(invoiceLineItems)
        .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
        .where(and(
          eq(invoices.orgId, org.id),
          isNotNull(invoiceLineItems.qbItemId),
          sql`${invoices.issueDate} >= ${cutoffStr}::date`,
        ));
      for (const r of rows) if (r.qbItemId) activeIds.add(r.qbItemId);
    }

    if (includePOs) {
      const rows = await db
        .selectDistinct({ qbItemId: purchaseOrderLineItems.qbItemId })
        .from(purchaseOrderLineItems)
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLineItems.purchaseOrderId))
        .where(and(
          eq(purchaseOrders.orgId, org.id),
          isNotNull(purchaseOrderLineItems.qbItemId),
          sql`${purchaseOrders.issueDate} >= ${cutoffStr}::date`,
        ));
      for (const r of rows) if (r.qbItemId) activeIds.add(r.qbItemId);
    }

    if (includeBills) {
      const rows = await db
        .selectDistinct({ qbItemId: billLineItems.qbItemId })
        .from(billLineItems)
        .innerJoin(bills, eq(bills.id, billLineItems.billId))
        .where(and(
          eq(bills.orgId, org.id),
          isNotNull(billLineItems.qbItemId),
          sql`${bills.issueDate} >= ${cutoffStr}::date`,
        ));
      for (const r of rows) if (r.qbItemId) activeIds.add(r.qbItemId);
    }

    // Current state
    const allItems = await db
      .select({ id: inventoryItems.id, qbItemId: inventoryItems.qbItemId, isTracked: inventoryItems.isTracked })
      .from(inventoryItems)
      .where(eq(inventoryItems.orgId, org.id));

    const total = allItems.length;
    const currentTracked = allItems.filter((i) => i.isTracked).length;
    const currentUntracked = total - currentTracked;

    let wouldStayTracked = 0;
    let wouldBecomeUntracked = 0;
    for (const it of allItems) {
      const inWindow = it.qbItemId ? activeIds.has(it.qbItemId) : false;
      if (inWindow) wouldStayTracked++;
      else wouldBecomeUntracked++;
    }

    // Apply when not dry run
    if (!dryRun) {
      const activeIdsArr = [...activeIds];
      const now = new Date();
      if (activeIdsArr.length > 0) {
        // Items in window → mark tracked
        await db
          .update(inventoryItems)
          .set({ isTracked: true, updatedAt: now })
          .where(and(
            eq(inventoryItems.orgId, org.id),
            inArray(inventoryItems.qbItemId, activeIdsArr),
          ));
        // Everything else (including items with no qbItemId at all) → untracked
        await db
          .update(inventoryItems)
          .set({ isTracked: false, updatedAt: now })
          .where(and(
            eq(inventoryItems.orgId, org.id),
            or(
              isNull(inventoryItems.qbItemId),
              notInArray(inventoryItems.qbItemId, activeIdsArr),
            ),
          ));
      } else {
        // No activity at all in the window — caller asked, so untrack everything.
        await db
          .update(inventoryItems)
          .set({ isTracked: false, updatedAt: now })
          .where(eq(inventoryItems.orgId, org.id));
      }
    }

    return NextResponse.json({
      window: { monthsBack, cutoff: cutoffStr },
      sources: { invoices: includeInvoices, purchaseOrders: includePOs, bills: includeBills },
      total,
      currentTracked,
      currentUntracked,
      activeIdsInWindow: activeIds.size,
      wouldStayTracked,
      wouldBecomeUntracked,
      applied: !dryRun,
    });
  } catch (err: any) {
    console.error('Inventory trim failed:', err);
    return NextResponse.json({ error: err?.message || 'Trim failed' }, { status: 500 });
  }
}
