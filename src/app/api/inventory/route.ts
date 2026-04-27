import { NextRequest, NextResponse } from 'next/server';
import { db, inventoryItems, bills, billLineItems } from '@/db';
import { and, eq, ilike, or, sql, desc, asc, inArray, isNull, isNotNull } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// Master list endpoint for the inventory workbench.
// Returns paginated items with computed cost intel:
//   lastPaidCost / lastPaidDate / lastPaidVendor — most recent bill line for this item
//   avgPaidCost   — 12-month average bill cost
//   billCount     — how many bills have ever included it (rough usage signal)
//   margin        — (unitPrice - cost) / unitPrice  (current sale - current cost)

const SORTS = {
  name: inventoryItems.name,
  qty: inventoryItems.quantityOnHand,
  unit_price: inventoryItems.unitPrice,
  cost: inventoryItems.cost,
  updated: inventoryItems.updatedAt,
} as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const filter = searchParams.get('filter') || 'tracked'; // tracked | untracked | all | low_stock | no_cost | inactive | active
    const category = searchParams.get('category') || '';
    const sort = (searchParams.get('sort') || 'name') as keyof typeof SORTS;
    const dir = (searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? desc : asc;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(500, Math.max(20, parseInt(searchParams.get('limit') || '100', 10)));

    const org = await getOrCreateDefaultOrg();

    // WHERE conditions
    const where = [eq(inventoryItems.orgId, org.id)] as any[];
    if (q) {
      const like = `%${q}%`;
      where.push(or(
        ilike(inventoryItems.name, like),
        ilike(inventoryItems.sku, like),
        ilike(inventoryItems.description, like),
        ilike(inventoryItems.category, like),
      ));
    }
    if (category) where.push(eq(inventoryItems.category, category));
    if (filter === 'tracked') where.push(eq(inventoryItems.isTracked, true));
    if (filter === 'untracked') where.push(eq(inventoryItems.isTracked, false));
    if (filter === 'active') where.push(eq(inventoryItems.isActive, true));
    if (filter === 'inactive') where.push(eq(inventoryItems.isActive, false));
    // Low stock = a reorder level has been explicitly set AND we're at or below it.
    // Items with no reorder level shouldn't be considered "low" just because qty=0.
    if (filter === 'low_stock') where.push(sql`${inventoryItems.reorderLevel} > 0 AND ${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`);
    if (filter === 'no_cost') where.push(or(isNull(inventoryItems.cost), eq(inventoryItems.cost, '0')));

    // Main paginated query
    const sortCol = SORTS[sort] ?? inventoryItems.name;
    const rows = await db
      .select()
      .from(inventoryItems)
      .where(and(...where))
      .orderBy(dir(sortCol), asc(inventoryItems.id))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ totalCount }] = await db
      .select({ totalCount: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(and(...where));

    // Build cost intel for the page's items only
    const qbItemIds = rows.map((r) => r.qbItemId).filter((x): x is string => !!x);
    const costStats = new Map<string, {
      lastPaidCost: number | null;
      lastPaidDate: string | null;
      lastPaidVendorId: string | null;
      avgPaidCost: number | null;
      billCount: number;
    }>();

    if (qbItemIds.length > 0) {
      // Aggregated per qbItemId — full history, not just last year.
      const agg = await db
        .select({
          qbItemId: billLineItems.qbItemId,
          billCount: sql<number>`count(*)::int`,
          avgPaidCost: sql<number | null>`avg(${billLineItems.unitCost})::numeric(12,4)`,
        })
        .from(billLineItems)
        .innerJoin(bills, eq(bills.id, billLineItems.billId))
        .where(and(
          eq(bills.orgId, org.id),
          inArray(billLineItems.qbItemId, qbItemIds),
        ))
        .groupBy(billLineItems.qbItemId);

      for (const r of agg) {
        if (!r.qbItemId) continue;
        costStats.set(r.qbItemId, {
          lastPaidCost: null,
          lastPaidDate: null,
          lastPaidVendorId: null,
          avgPaidCost: r.avgPaidCost ? Number(r.avgPaidCost) : null,
          billCount: r.billCount,
        });
      }

      // Most recent bill line per qbItemId. Use the query builder (avoids the
      // array-binding pitfall in raw sql template) and dedup by qb_item_id in JS.
      const recentRows = await db
        .select({
          qbItemId: billLineItems.qbItemId,
          unitCost: billLineItems.unitCost,
          issueDate: bills.issueDate,
          vendorId: bills.vendorId,
        })
        .from(billLineItems)
        .innerJoin(bills, eq(bills.id, billLineItems.billId))
        .where(and(
          eq(bills.orgId, org.id),
          inArray(billLineItems.qbItemId, qbItemIds),
        ))
        .orderBy(desc(bills.issueDate));

      const seen = new Set<string>();
      for (const r of recentRows) {
        if (!r.qbItemId || seen.has(r.qbItemId)) continue;
        seen.add(r.qbItemId);
        const existing = costStats.get(r.qbItemId) || {
          lastPaidCost: null, lastPaidDate: null, lastPaidVendorId: null, avgPaidCost: null, billCount: 0,
        };
        existing.lastPaidCost = r.unitCost != null ? Number(r.unitCost) : null;
        existing.lastPaidDate = r.issueDate || null;
        existing.lastPaidVendorId = r.vendorId || null;
        costStats.set(r.qbItemId, existing);
      }
    }

    const items = rows.map((r) => {
      const stats = (r.qbItemId && costStats.get(r.qbItemId)) || {
        lastPaidCost: null, lastPaidDate: null, lastPaidVendorId: null, avgPaidCost: null, billCount: 0,
      };
      const sale = r.unitPrice != null ? Number(r.unitPrice) : null;
      const cost = r.cost != null ? Number(r.cost) : null;
      const margin = sale && cost && sale > 0 ? ((sale - cost) / sale) * 100 : null;
      const reorderLevel = r.reorderLevel ?? 0;
      const onHand = r.quantityOnHand ?? 0;
      const isLowStock = reorderLevel > 0 && onHand <= reorderLevel;
      return {
        id: r.id,
        qbItemId: r.qbItemId,
        sku: r.sku,
        name: r.name,
        description: r.description,
        category: r.category,
        location: r.location,
        unitPrice: sale,
        cost,
        margin,
        quantityOnHand: onHand,
        reorderLevel,
        isLowStock,
        isActive: r.isActive ?? true,
        isTracked: r.isTracked ?? true,
        lastSyncedAt: r.lastSyncedAt,
        updatedAt: r.updatedAt,
        ...stats,
      };
    });

    // Global stats banner — based on tracked items so the numbers reflect the
    // working set the secretary actually cares about.
    const [{ totalItems }] = await db
      .select({ totalItems: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(eq(inventoryItems.orgId, org.id));

    const [{ trackedItems }] = await db
      .select({ trackedItems: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, org.id), eq(inventoryItems.isTracked, true)));

    const [{ untrackedItems }] = await db
      .select({ untrackedItems: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, org.id), eq(inventoryItems.isTracked, false)));

    const [{ lowStockCount }] = await db
      .select({ lowStockCount: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.orgId, org.id),
        eq(inventoryItems.isTracked, true),
        sql`${inventoryItems.reorderLevel} > 0 AND ${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`,
      ));

    const [{ noCostCount }] = await db
      .select({ noCostCount: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.orgId, org.id),
        eq(inventoryItems.isTracked, true),
        or(isNull(inventoryItems.cost), eq(inventoryItems.cost, '0')),
      ));

    const [{ totalValue }] = await db
      .select({
        totalValue: sql<number>`COALESCE(SUM(${inventoryItems.quantityOnHand} * ${inventoryItems.cost}), 0)::numeric(14,2)`,
      })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.orgId, org.id),
        eq(inventoryItems.isTracked, true),
        isNotNull(inventoryItems.cost),
      ));

    // Distinct categories for the dropdown
    const cats = await db
      .selectDistinct({ category: inventoryItems.category })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.orgId, org.id),
        isNotNull(inventoryItems.category),
      ));

    return NextResponse.json({
      items,
      page,
      limit,
      totalCount,
      stats: {
        totalItems,
        trackedItems,
        untrackedItems,
        lowStockCount,
        noCostCount,
        totalValue: Number(totalValue || 0),
      },
      categories: cats.map((c) => c.category).filter(Boolean),
    });
  } catch (err: any) {
    console.error('Inventory list failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed to load inventory' }, { status: 500 });
  }
}
