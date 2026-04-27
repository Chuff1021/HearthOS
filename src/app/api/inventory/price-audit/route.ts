import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  inventoryItems,
  purchaseOrders,
  purchaseOrderLineItems,
  vendors,
} from '@/db';
import { and, eq, sql, isNotNull, desc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/inventory/price-audit
// Compare every tracked inventory item's `cost` against its most recent
// PO unit_cost. Return items where the variance is meaningful so the
// secretary can decide what to correct.
//
// Query params:
//   monthsBack       — only consider POs in the last N months (default 24)
//   minVariancePct   — only flag items where |Δ| / cost > this %  (default 1)
//   minVarianceAmt   — and where |Δ| ≥ this $  (default 0.01)
//   includeRetired   — also audit retired items (default false)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const monthsBack = Math.max(1, Math.min(120, Number(searchParams.get('monthsBack')) || 24));
    const minVariancePct = Math.max(0, Number(searchParams.get('minVariancePct')) || 1);
    const minVarianceAmt = Math.max(0, Number(searchParams.get('minVarianceAmt')) || 0.01);
    const includeRetired = searchParams.get('includeRetired') === 'true';

    const org = await getOrCreateDefaultOrg();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Pull recent PO lines once, ordered by issue date desc, then dedup by qb_item_id
    // in JS to get the most recent unit_cost + vendor + PO number per item.
    const poRows = await db
      .select({
        qbItemId: purchaseOrderLineItems.qbItemId,
        unitCost: purchaseOrderLineItems.unitCost,
        issueDate: purchaseOrders.issueDate,
        poId: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        vendorId: vendors.id,
        vendorName: vendors.displayName,
      })
      .from(purchaseOrderLineItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLineItems.purchaseOrderId))
      .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(and(
        eq(purchaseOrders.orgId, org.id),
        isNotNull(purchaseOrderLineItems.qbItemId),
        sql`${purchaseOrders.issueDate} >= ${cutoffStr}::date`,
      ))
      .orderBy(desc(purchaseOrders.issueDate));

    // Most recent PO per qb_item_id
    type LatestPO = {
      unitCost: number;
      issueDate: string | null;
      poId: string;
      poNumber: string | null;
      vendorId: string | null;
      vendorName: string | null;
    };
    const latestByItem = new Map<string, LatestPO>();
    for (const r of poRows) {
      if (!r.qbItemId) continue;
      if (latestByItem.has(r.qbItemId)) continue; // first hit is most recent (desc sort)
      const cost = Number(r.unitCost ?? 0);
      if (!cost || cost <= 0) continue;
      latestByItem.set(r.qbItemId, {
        unitCost: cost,
        issueDate: r.issueDate ?? null,
        poId: r.poId,
        poNumber: r.poNumber ?? null,
        vendorId: r.vendorId ?? null,
        vendorName: r.vendorName ?? null,
      });
    }

    // Pull tracked inventory items (or all if includeRetired) with a qb_item_id
    const itemWhere = includeRetired
      ? and(eq(inventoryItems.orgId, org.id), isNotNull(inventoryItems.qbItemId))
      : and(eq(inventoryItems.orgId, org.id), isNotNull(inventoryItems.qbItemId), eq(inventoryItems.isTracked, true));

    const items = await db
      .select({
        id: inventoryItems.id,
        qbItemId: inventoryItems.qbItemId,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
        category: inventoryItems.category,
        currentCost: inventoryItems.cost,
        unitPrice: inventoryItems.unitPrice,
        isTracked: inventoryItems.isTracked,
      })
      .from(inventoryItems)
      .where(itemWhere);

    type AuditRow = {
      id: string;
      qbItemId: string;
      name: string;
      sku: string | null;
      category: string | null;
      currentCost: number;
      poCost: number;
      delta: number;       // poCost - currentCost (positive = vendor charges more)
      pctDelta: number;    // % change vs currentCost (signed)
      isTracked: boolean;
      noCostSet: boolean;
      vendorName: string | null;
      vendorId: string | null;
      poId: string;
      poNumber: string | null;
      poDate: string | null;
      unitPrice: number | null;
      newMargin: number | null;  // post-correction margin if unitPrice known
    };

    const flagged: AuditRow[] = [];
    let totalAdjustment = 0; // sum of absolute deltas (informational)

    for (const it of items) {
      if (!it.qbItemId) continue;
      const po = latestByItem.get(it.qbItemId);
      if (!po) continue;

      const currentCost = it.currentCost != null ? Number(it.currentCost) : 0;
      const poCost = po.unitCost;
      const delta = poCost - currentCost;
      const pctDelta = currentCost > 0 ? (delta / currentCost) * 100 : (poCost > 0 ? 100 : 0);

      const noCostSet = currentCost === 0;
      const meetsAmt = Math.abs(delta) >= minVarianceAmt;
      const meetsPct = noCostSet || Math.abs(pctDelta) >= minVariancePct;
      if (!meetsAmt || !meetsPct) continue;

      const sale = it.unitPrice != null ? Number(it.unitPrice) : null;
      const newMargin = sale && sale > 0 ? ((sale - poCost) / sale) * 100 : null;

      flagged.push({
        id: it.id,
        qbItemId: it.qbItemId,
        name: it.name,
        sku: it.sku ?? null,
        category: it.category ?? null,
        currentCost,
        poCost,
        delta,
        pctDelta,
        isTracked: it.isTracked,
        noCostSet,
        vendorName: po.vendorName,
        vendorId: po.vendorId,
        poId: po.poId,
        poNumber: po.poNumber,
        poDate: po.issueDate,
        unitPrice: sale,
        newMargin,
      });
      totalAdjustment += Math.abs(delta);
    }

    // Sort by absolute % variance desc so the worst offenders are at the top
    flagged.sort((a, b) => Math.abs(b.pctDelta) - Math.abs(a.pctDelta));

    return NextResponse.json({
      window: { monthsBack, cutoff: cutoffStr },
      thresholds: { minVariancePct, minVarianceAmt },
      itemsConsidered: items.length,
      itemsWithRecentPO: latestByItem.size,
      itemsFlagged: flagged.length,
      noCostSetCount: flagged.filter((f) => f.noCostSet).length,
      goingUpCount: flagged.filter((f) => f.delta > 0).length,
      goingDownCount: flagged.filter((f) => f.delta < 0).length,
      totalAdjustment,
      rows: flagged,
    });
  } catch (err: any) {
    console.error('Price audit failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
