import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  invoices,
  invoiceLineItems,
  customers,
  inventoryItems,
  bills,
  billLineItems,
} from '@/db';
import { and, eq, sql, desc, asc, ilike, or, inArray, isNotNull, gte, lte } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/reports/profit-by-job
// Per-invoice P&L. Each invoice represents one "job" — the unit of customer
// work. For each invoice we compute:
//   revenue       : sum of line totals (pre-tax)
//   tax           : invoice tax amount
//   billed        : revenue + tax (what the customer owes)
//   cogs          : sum of (line.qty × inventory.cost) where the line has a qbItemId
//   billable      : sum of bill_line_items.amount where bill.vendor was paid for an
//                   item attributed to this customer with bill date in [issue-30d, issue+60d]
//   profit        : revenue − cogs − billable
//   margin        : profit / revenue
//
// Note: labor cost isn't yet attributed (time entries aren't linked to invoices).
// We'll layer that in once tech rates + per-job time tracking exist.

const SORTS = {
  date: invoices.issueDate,
  number: invoices.invoiceNumber,
  revenue: invoices.subtotal,
  total: invoices.totalAmount,
} as const;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const status = searchParams.get('status') || ''; // draft / sent / paid / void
    const customerId = searchParams.get('customerId') || '';
    const since = searchParams.get('since') || ''; // YYYY-MM-DD
    const until = searchParams.get('until') || '';
    const profitFilter = searchParams.get('profitFilter') || 'all'; // all / unprofitable / negativeMargin
    const sort = (searchParams.get('sort') || 'date') as keyof typeof SORTS;
    const dir = (searchParams.get('dir') || 'desc').toLowerCase() === 'asc' ? asc : desc;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(500, Math.max(20, parseInt(searchParams.get('limit') || '100', 10)));

    const org = await getOrCreateDefaultOrg();

    const where: any[] = [eq(invoices.orgId, org.id)];
    if (status) where.push(eq(invoices.status, status as any));
    if (customerId) where.push(eq(invoices.customerId, customerId));
    if (since) where.push(gte(invoices.issueDate, since));
    if (until) where.push(lte(invoices.issueDate, until));
    if (q) {
      const like = `%${q}%`;
      where.push(or(
        ilike(invoices.invoiceNumber, like),
        ilike(invoices.notes, like),
      ));
    }

    // Page of invoices
    const sortCol = SORTS[sort] ?? invoices.issueDate;
    const rows = await db
      .select({
        invoice: invoices,
        customerId: customers.id,
        customerName: sql<string>`COALESCE(${customers.companyName}, ${customers.firstName} || ' ' || ${customers.lastName})`,
      })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .where(and(...where))
      .orderBy(dir(sortCol), asc(invoices.id))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ totalCount }] = await db
      .select({ totalCount: sql<number>`count(*)::int` })
      .from(invoices)
      .where(and(...where));

    if (rows.length === 0) {
      return NextResponse.json({
        items: [],
        page, limit, totalCount,
        stats: { totalInvoices: 0, totalRevenue: 0, totalCogs: 0, totalBillable: 0, totalProfit: 0, avgMargin: null, unprofitableCount: 0 },
      });
    }

    const invoiceIds = rows.map((r) => r.invoice.id);
    const customerIds = [...new Set(rows.map((r) => r.invoice.customerId).filter(Boolean) as string[])];

    // Pull line items for these invoices in one query, then aggregate per invoice in JS
    const lineRows = await db
      .select({
        invoiceId: invoiceLineItems.invoiceId,
        qbItemId: invoiceLineItems.qbItemId,
        quantity: invoiceLineItems.quantity,
        total: invoiceLineItems.total,
      })
      .from(invoiceLineItems)
      .where(inArray(invoiceLineItems.invoiceId, invoiceIds));

    // Pull cost map for the qbItemIds we encountered
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

    // Aggregate revenue + cogs per invoice
    const perInv = new Map<string, { revenue: number; cogs: number }>();
    for (const li of lineRows) {
      const inv = perInv.get(li.invoiceId) || { revenue: 0, cogs: 0 };
      inv.revenue += Number(li.total ?? 0);
      const qty = Number(li.quantity ?? 0);
      const cost = li.qbItemId ? (costByQb.get(li.qbItemId) ?? 0) : 0;
      inv.cogs += qty * cost;
      perInv.set(li.invoiceId, inv);
    }

    // Billable bill expenses: bills attributed to the same customer with date
    // in [issue-30d, issue+60d]. We pull them in one query for the customers
    // touched on this page, then bucket per-invoice in JS.
    type BillRow = { invoiceCustomerId: string | null; amount: number; issueDate: string | null };
    let billRows: BillRow[] = [];
    if (customerIds.length > 0) {
      // Get a wide window — earliest invoice date - 30d, latest invoice date + 60d
      const dates = rows.map((r) => r.invoice.issueDate).filter(Boolean) as string[];
      const minDate = dates.reduce((a, b) => (a < b ? a : b), dates[0]);
      const maxDate = dates.reduce((a, b) => (a > b ? a : b), dates[0]);
      const windowFrom = new Date(minDate); windowFrom.setDate(windowFrom.getDate() - 30);
      const windowTo = new Date(maxDate); windowTo.setDate(windowTo.getDate() + 60);

      const raw = await db
        .select({
          invoiceCustomerId: billLineItems.customerId,
          amount: billLineItems.amount,
          issueDate: bills.issueDate,
        })
        .from(billLineItems)
        .innerJoin(bills, eq(bills.id, billLineItems.billId))
        .where(and(
          eq(bills.orgId, org.id),
          inArray(billLineItems.customerId, customerIds),
          gte(bills.issueDate, windowFrom.toISOString().slice(0, 10)),
          lte(bills.issueDate, windowTo.toISOString().slice(0, 10)),
        ));
      billRows = raw.map((b) => ({
        invoiceCustomerId: b.invoiceCustomerId ?? null,
        amount: Number(b.amount ?? 0),
        issueDate: b.issueDate ?? null,
      }));
    }

    // For each invoice, sum bill amounts for that customer in [issueDate-30d, issueDate+60d]
    const billByInv = new Map<string, number>();
    for (const r of rows) {
      if (!r.invoice.customerId || !r.invoice.issueDate) continue;
      const ts = new Date(r.invoice.issueDate).getTime();
      const lo = ts - 30 * 86400_000;
      const hi = ts + 60 * 86400_000;
      let sum = 0;
      for (const b of billRows) {
        if (b.invoiceCustomerId !== r.invoice.customerId) continue;
        if (!b.issueDate) continue;
        const bts = new Date(b.issueDate).getTime();
        if (bts >= lo && bts <= hi) sum += b.amount;
      }
      billByInv.set(r.invoice.id, sum);
    }

    const items = rows.map(({ invoice: inv, customerId: cid, customerName }) => {
      const agg = perInv.get(inv.id) || { revenue: 0, cogs: 0 };
      const billable = billByInv.get(inv.id) ?? 0;
      const tax = Number(inv.taxAmount ?? 0);
      const billed = agg.revenue + tax;
      const profit = agg.revenue - agg.cogs - billable;
      const margin = agg.revenue > 0 ? (profit / agg.revenue) * 100 : null;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        status: inv.status,
        customerId: cid,
        customerName,
        revenue: agg.revenue,
        tax,
        billed,
        cogs: agg.cogs,
        billable,
        profit,
        margin,
        balance: Number(inv.balance ?? 0),
      };
    });

    // Filter by profit if requested (post-compute)
    let filteredItems = items;
    if (profitFilter === 'unprofitable') filteredItems = items.filter((i) => i.profit < 0);
    if (profitFilter === 'negativeMargin') filteredItems = items.filter((i) => i.margin != null && i.margin < 0);

    // Aggregate stats — for the FULL filter set, not just this page
    // (Compute approximate aggregate over the whole filter window via a separate sum query.)
    const allFiltered = await db
      .select({
        invoiceCount: sql<number>`count(*)::int`,
        totalSubtotal: sql<number>`COALESCE(SUM(${invoices.subtotal}), 0)::numeric(14,2)`,
      })
      .from(invoices)
      .where(and(...where));

    return NextResponse.json({
      items: filteredItems,
      page,
      limit,
      totalCount: profitFilter === 'all' ? totalCount : filteredItems.length, // approximate — accurate filter count requires more compute
      stats: {
        totalInvoices: allFiltered[0].invoiceCount,
        totalRevenue: Number(allFiltered[0].totalSubtotal),
        // Page-only roll-ups (cheap)
        pageRevenue: items.reduce((s, x) => s + x.revenue, 0),
        pageCogs: items.reduce((s, x) => s + x.cogs, 0),
        pageBillable: items.reduce((s, x) => s + x.billable, 0),
        pageProfit: items.reduce((s, x) => s + x.profit, 0),
        unprofitableCount: items.filter((x) => x.profit < 0).length,
        avgMargin: items.length > 0
          ? items.filter((x) => x.margin != null).reduce((s, x) => s + (x.margin || 0), 0) /
            (items.filter((x) => x.margin != null).length || 1)
          : null,
      },
    });
  } catch (err: any) {
    console.error('Profit-by-job report failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
