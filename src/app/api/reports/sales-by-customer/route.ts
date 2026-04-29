import { NextRequest, NextResponse } from 'next/server';
import { db, invoices, invoiceLineItems, inventoryItems, customers } from '@/db';
import { and, eq, gte, lte, sql, inArray } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/reports/sales-by-customer
// Top customers by revenue with invoice count, last sale date, open balance,
// and rough margin (revenue minus inventory_items.cost × qty COGS).

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since') || '';
    const until = searchParams.get('until') || '';
    const limit = Math.min(500, Math.max(20, parseInt(searchParams.get('limit') || '100', 10)));

    const org = await getOrCreateDefaultOrg();

    const where: any[] = [eq(invoices.orgId, org.id)];
    if (since) where.push(gte(invoices.issueDate, since));
    if (until) where.push(lte(invoices.issueDate, until));

    // Pull invoices in window
    const invs = await db
      .select({
        id: invoices.id,
        customerId: invoices.customerId,
        issueDate: invoices.issueDate,
        totalAmount: invoices.totalAmount,
        balance: invoices.balance,
      })
      .from(invoices)
      .where(and(...where));

    if (invs.length === 0) {
      return NextResponse.json({ customers: [], totals: { revenue: 0, openBalance: 0, invoiceCount: 0, customerCount: 0 } });
    }

    const invoiceIds = invs.map((i) => i.id);
    const customerIds = [...new Set(invs.map((i) => i.customerId).filter(Boolean) as string[])];

    // Pull line items + inventory cost for COGS
    const lineRows = await db
      .select({
        invoiceId: invoiceLineItems.invoiceId,
        qbItemId: invoiceLineItems.qbItemId,
        quantity: invoiceLineItems.quantity,
        total: invoiceLineItems.total,
      })
      .from(invoiceLineItems)
      .where(inArray(invoiceLineItems.invoiceId, invoiceIds));

    const qbItemIds = [...new Set(lineRows.map((l) => l.qbItemId).filter(Boolean) as string[])];
    const costRows = qbItemIds.length > 0
      ? await db
          .select({ qbItemId: inventoryItems.qbItemId, cost: inventoryItems.cost })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.orgId, org.id), inArray(inventoryItems.qbItemId, qbItemIds)))
      : [];
    const costByQb = new Map<string, number>();
    for (const c of costRows) {
      if (c.qbItemId) costByQb.set(c.qbItemId, c.cost != null ? Number(c.cost) : 0);
    }

    // Per-invoice cogs
    const cogsByInv = new Map<string, number>();
    for (const li of lineRows) {
      const qty = Number(li.quantity ?? 0);
      const c = li.qbItemId ? (costByQb.get(li.qbItemId) ?? 0) : 0;
      cogsByInv.set(li.invoiceId, (cogsByInv.get(li.invoiceId) ?? 0) + qty * c);
    }

    // Customer name lookup
    const custRows = customerIds.length > 0
      ? await db
          .select({
            id: customers.id,
            firstName: customers.firstName,
            lastName: customers.lastName,
            companyName: customers.companyName,
            email: customers.email,
            phone: customers.phone,
          })
          .from(customers)
          .where(and(eq(customers.orgId, org.id), inArray(customers.id, customerIds)))
      : [];
    const custById = new Map(custRows.map((c) => [c.id, c]));

    // Aggregate per customer
    type Row = {
      customerId: string | null;
      customerName: string;
      email: string | null;
      phone: string | null;
      revenue: number;
      cogs: number;
      profit: number;
      margin: number | null;
      openBalance: number;
      invoiceCount: number;
      lastSale: string | null;
    };
    const byCustomer = new Map<string, Row>();
    let totalRevenue = 0;
    let totalOpen = 0;

    for (const inv of invs) {
      const key = inv.customerId || 'unknown';
      const cust = inv.customerId ? custById.get(inv.customerId) : null;
      const name = cust
        ? (cust.companyName || [cust.firstName, cust.lastName].filter(Boolean).join(' ').trim() || 'Customer')
        : 'Unknown customer';
      let row = byCustomer.get(key);
      if (!row) {
        row = {
          customerId: inv.customerId ?? null,
          customerName: name,
          email: cust?.email ?? null,
          phone: cust?.phone ?? null,
          revenue: 0, cogs: 0, profit: 0, margin: null,
          openBalance: 0, invoiceCount: 0, lastSale: null,
        };
        byCustomer.set(key, row);
      }
      const rev = Number(inv.totalAmount ?? 0);
      const cogs = cogsByInv.get(inv.id) ?? 0;
      row.revenue += rev;
      row.cogs += cogs;
      row.openBalance += Number(inv.balance ?? 0);
      row.invoiceCount++;
      if (!row.lastSale || (inv.issueDate && inv.issueDate > row.lastSale)) row.lastSale = inv.issueDate;
      totalRevenue += rev;
      totalOpen += Number(inv.balance ?? 0);
    }

    const out: Row[] = [...byCustomer.values()].map((r) => {
      r.profit = Number((r.revenue - r.cogs).toFixed(2));
      r.margin = r.revenue > 0 ? Number(((r.profit / r.revenue) * 100).toFixed(1)) : null;
      return r;
    });
    out.sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      customers: out.slice(0, limit),
      totals: {
        revenue: Number(totalRevenue.toFixed(2)),
        openBalance: Number(totalOpen.toFixed(2)),
        invoiceCount: invs.length,
        customerCount: out.length,
      },
      window: { since: since || null, until: until || null },
    });
  } catch (err: any) {
    console.error('Sales by customer failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
