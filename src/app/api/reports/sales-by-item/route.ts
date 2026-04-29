import { NextRequest, NextResponse } from 'next/server';
import { db, invoices, invoiceLineItems, inventoryItems } from '@/db';
import { and, eq, gte, lte, sql, inArray } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/reports/sales-by-item
// Aggregate invoice line items by qb_item_id. Per item: qty sold, revenue,
// COGS (inventory_items.cost × qty), profit, margin, last sold date,
// invoice count.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since') || '';
    const until = searchParams.get('until') || '';
    const limit = Math.min(1000, Math.max(20, parseInt(searchParams.get('limit') || '200', 10)));

    const org = await getOrCreateDefaultOrg();

    const where: any[] = [eq(invoices.orgId, org.id)];
    if (since) where.push(gte(invoices.issueDate, since));
    if (until) where.push(lte(invoices.issueDate, until));

    // Pull every line in window
    const lineRows = await db
      .select({
        invoiceId: invoiceLineItems.invoiceId,
        qbItemId: invoiceLineItems.qbItemId,
        description: invoiceLineItems.description,
        quantity: invoiceLineItems.quantity,
        unitPrice: invoiceLineItems.unitPrice,
        total: invoiceLineItems.total,
        issueDate: invoices.issueDate,
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
      .where(and(...where));

    if (lineRows.length === 0) {
      return NextResponse.json({ items: [], totals: { revenue: 0, qty: 0, profit: 0 } });
    }

    // Inventory lookup for canonical name + COGS
    const qbItemIds = [...new Set(lineRows.map((l) => l.qbItemId).filter(Boolean) as string[])];
    const invRows = qbItemIds.length > 0
      ? await db
          .select({
            qbItemId: inventoryItems.qbItemId,
            name: inventoryItems.name,
            sku: inventoryItems.sku,
            cost: inventoryItems.cost,
            unitPrice: inventoryItems.unitPrice,
          })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.orgId, org.id), inArray(inventoryItems.qbItemId, qbItemIds)))
      : [];
    const invByQb = new Map(invRows.map((r) => [r.qbItemId!, r]));

    type Row = {
      qbItemId: string | null;
      name: string;
      sku: string | null;
      qty: number;
      revenue: number;
      cogs: number;
      profit: number;
      margin: number | null;
      avgPrice: number;
      invoiceCount: number;
      lastSold: string | null;
    };
    const byItem = new Map<string, Row & { _invoiceIds: Set<string> }>();
    let totalRevenue = 0;
    let totalQty = 0;
    let totalProfit = 0;

    for (const li of lineRows) {
      const qty = Number(li.quantity ?? 0);
      const total = Number(li.total ?? 0);
      const inv = li.qbItemId ? invByQb.get(li.qbItemId) : undefined;
      const unitCost = inv?.cost != null ? Number(inv.cost) : 0;
      const cogs = qty * unitCost;
      const key = li.qbItemId || `desc:${(li.description || '').trim().toLowerCase()}` || 'untracked';
      let row = byItem.get(key);
      if (!row) {
        row = {
          qbItemId: li.qbItemId ?? null,
          name: inv?.name || (li.description || 'Untracked').split('\n')[0],
          sku: inv?.sku ?? null,
          qty: 0, revenue: 0, cogs: 0, profit: 0, margin: null,
          avgPrice: 0, invoiceCount: 0, lastSold: null,
          _invoiceIds: new Set<string>(),
        };
        byItem.set(key, row);
      }
      row.qty += qty;
      row.revenue += total;
      row.cogs += cogs;
      row._invoiceIds.add(li.invoiceId);
      if (li.issueDate && (!row.lastSold || li.issueDate > row.lastSold)) row.lastSold = li.issueDate;
      totalRevenue += total;
      totalQty += qty;
      totalProfit += total - cogs;
    }

    const out: Row[] = [...byItem.values()].map((r) => {
      const profit = Number((r.revenue - r.cogs).toFixed(2));
      return {
        qbItemId: r.qbItemId,
        name: r.name,
        sku: r.sku,
        qty: Number(r.qty.toFixed(2)),
        revenue: Number(r.revenue.toFixed(2)),
        cogs: Number(r.cogs.toFixed(2)),
        profit,
        margin: r.revenue > 0 ? Number(((profit / r.revenue) * 100).toFixed(1)) : null,
        avgPrice: r.qty > 0 ? Number((r.revenue / r.qty).toFixed(2)) : 0,
        invoiceCount: r._invoiceIds.size,
        lastSold: r.lastSold,
      };
    });
    out.sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      items: out.slice(0, limit),
      totals: {
        revenue: Number(totalRevenue.toFixed(2)),
        qty: Number(totalQty.toFixed(2)),
        profit: Number(totalProfit.toFixed(2)),
        itemCount: out.length,
      },
      window: { since: since || null, until: until || null },
    });
  } catch (err: any) {
    console.error('Sales by item failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
