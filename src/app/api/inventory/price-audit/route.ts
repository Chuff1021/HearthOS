import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  inventoryItems,
  purchaseOrders,
  purchaseOrderLineItems,
  bills,
  billLineItems,
  vendors,
} from '@/db';
import { and, eq, sql, isNotNull, desc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/inventory/price-audit
// Compare every tracked inventory item's cost against the most recent
// supplier price seen on a bill (default), a PO, or whichever is most
// recent ("either" mode).
//
// Bills are typically more authoritative because they reflect what was
// actually paid; POs only reflect what was ordered.
//
// Query params:
//   source           — 'bills' (default) | 'pos' | 'either'
//   monthsBack       — only consider docs in the last N months (default 24)
//   minVariancePct   — only flag items where |Δ| / cost > this %  (default 1)
//   minVarianceAmt   — and where |Δ| ≥ this $  (default 0.01)
//   includeRetired   — also audit retired items (default false)

type SourceKind = 'bill' | 'po';
type LatestSource = {
  unitCost: number;
  issueDate: string | null;
  sourceType: SourceKind;
  sourceId: string;
  sourceNumber: string | null;
  vendorId: string | null;
  vendorName: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sourceParam = (searchParams.get('source') || 'bills').toLowerCase();
    const useBills = sourceParam === 'bills' || sourceParam === 'either';
    const usePOs = sourceParam === 'pos' || sourceParam === 'either';
    const monthsBack = Math.max(1, Math.min(120, Number(searchParams.get('monthsBack')) || 24));
    const minVariancePct = Math.max(0, Number(searchParams.get('minVariancePct')) || 1);
    const minVarianceAmt = Math.max(0, Number(searchParams.get('minVarianceAmt')) || 0.01);
    const includeRetired = searchParams.get('includeRetired') === 'true';

    const org = await getOrCreateDefaultOrg();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const latestByItem = new Map<string, LatestSource>();

    // Helper that records a candidate, keeping whichever has the more recent date
    const consider = (qbItemId: string | null, candidate: LatestSource) => {
      if (!qbItemId) return;
      if (!candidate.unitCost || candidate.unitCost <= 0) return;
      const cur = latestByItem.get(qbItemId);
      if (!cur) { latestByItem.set(qbItemId, candidate); return; }
      const a = candidate.issueDate ? new Date(candidate.issueDate).getTime() : 0;
      const b = cur.issueDate ? new Date(cur.issueDate).getTime() : 0;
      if (a > b) latestByItem.set(qbItemId, candidate);
    };

    if (useBills) {
      const billRows = await db
        .select({
          qbItemId: billLineItems.qbItemId,
          unitCost: billLineItems.unitCost,
          amount: billLineItems.amount,
          quantity: billLineItems.quantity,
          issueDate: bills.issueDate,
          billId: bills.id,
          billNumber: bills.billNumber,
          vendorId: vendors.id,
          vendorName: vendors.displayName,
        })
        .from(billLineItems)
        .innerJoin(bills, eq(bills.id, billLineItems.billId))
        .leftJoin(vendors, eq(vendors.id, bills.vendorId))
        .where(and(
          eq(bills.orgId, org.id),
          isNotNull(billLineItems.qbItemId),
          sql`${bills.issueDate} >= ${cutoffStr}::date`,
        ))
        .orderBy(desc(bills.issueDate));

      const seen = new Set<string>();
      for (const r of billRows) {
        if (!r.qbItemId) continue;
        if (seen.has(r.qbItemId)) continue; // first hit per item is most recent
        seen.add(r.qbItemId);

        // Prefer unit_cost; fall back to amount/qty if unit_cost was missing
        let cost = Number(r.unitCost ?? 0);
        if (!cost || cost <= 0) {
          const amt = Number(r.amount ?? 0);
          const qty = Number(r.quantity ?? 0);
          if (qty > 0 && amt > 0) cost = amt / qty;
        }
        if (!cost || cost <= 0) continue;

        consider(r.qbItemId, {
          unitCost: cost,
          issueDate: r.issueDate ?? null,
          sourceType: 'bill',
          sourceId: r.billId,
          sourceNumber: r.billNumber ?? null,
          vendorId: r.vendorId ?? null,
          vendorName: r.vendorName ?? null,
        });
      }
    }

    if (usePOs) {
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

      // For POs we still want first-per-item, but in 'either' mode the bill
      // pass may have already populated this item — that's fine, consider()
      // will keep whichever doc is more recent.
      const seenPO = new Set<string>();
      for (const r of poRows) {
        if (!r.qbItemId) continue;
        if (seenPO.has(r.qbItemId)) continue;
        seenPO.add(r.qbItemId);
        const cost = Number(r.unitCost ?? 0);
        if (!cost || cost <= 0) continue;
        consider(r.qbItemId, {
          unitCost: cost,
          issueDate: r.issueDate ?? null,
          sourceType: 'po',
          sourceId: r.poId,
          sourceNumber: r.poNumber ?? null,
          vendorId: r.vendorId ?? null,
          vendorName: r.vendorName ?? null,
        });
      }
    }

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
      vendorCost: number;       // the latest cost from chosen source
      delta: number;
      pctDelta: number;
      isTracked: boolean;
      noCostSet: boolean;
      vendorName: string | null;
      vendorId: string | null;
      sourceType: SourceKind;   // 'bill' or 'po'
      sourceId: string;
      sourceNumber: string | null;
      sourceDate: string | null;
      unitPrice: number | null;
      newMargin: number | null;
    };

    const flagged: AuditRow[] = [];
    let totalAdjustment = 0;

    for (const it of items) {
      if (!it.qbItemId) continue;
      const src = latestByItem.get(it.qbItemId);
      if (!src) continue;

      const currentCost = it.currentCost != null ? Number(it.currentCost) : 0;
      const vendorCost = src.unitCost;
      const delta = vendorCost - currentCost;
      const pctDelta = currentCost > 0 ? (delta / currentCost) * 100 : (vendorCost > 0 ? 100 : 0);

      const noCostSet = currentCost === 0;
      const meetsAmt = Math.abs(delta) >= minVarianceAmt;
      const meetsPct = noCostSet || Math.abs(pctDelta) >= minVariancePct;
      if (!meetsAmt || !meetsPct) continue;

      const sale = it.unitPrice != null ? Number(it.unitPrice) : null;
      const newMargin = sale && sale > 0 ? ((sale - vendorCost) / sale) * 100 : null;

      flagged.push({
        id: it.id,
        qbItemId: it.qbItemId,
        name: it.name,
        sku: it.sku ?? null,
        category: it.category ?? null,
        currentCost,
        vendorCost,
        delta,
        pctDelta,
        isTracked: it.isTracked,
        noCostSet,
        vendorName: src.vendorName,
        vendorId: src.vendorId,
        sourceType: src.sourceType,
        sourceId: src.sourceId,
        sourceNumber: src.sourceNumber,
        sourceDate: src.issueDate,
        unitPrice: sale,
        newMargin,
      });
      totalAdjustment += Math.abs(delta);
    }

    flagged.sort((a, b) => Math.abs(b.pctDelta) - Math.abs(a.pctDelta));

    return NextResponse.json({
      window: { monthsBack, cutoff: cutoffStr },
      source: sourceParam,
      thresholds: { minVariancePct, minVarianceAmt },
      itemsConsidered: items.length,
      itemsWithData: latestByItem.size,
      itemsFlagged: flagged.length,
      noCostSetCount: flagged.filter((f) => f.noCostSet).length,
      goingUpCount: flagged.filter((f) => f.delta > 0).length,
      goingDownCount: flagged.filter((f) => f.delta < 0).length,
      bySourceType: {
        bill: flagged.filter((f) => f.sourceType === 'bill').length,
        po: flagged.filter((f) => f.sourceType === 'po').length,
      },
      totalAdjustment,
      rows: flagged,
    });
  } catch (err: any) {
    console.error('Price audit failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
