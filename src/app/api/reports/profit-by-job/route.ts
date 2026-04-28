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
import { and, eq, sql, desc, asc, ilike, or, inArray, gte, lte } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/reports/profit-by-job
// Returns BOTH the paginated page (for the table) AND aggregate stats over
// the entire filtered window (for the banner).
//
// The window roll-up uses the same per-invoice attribution as the table — sum
// of line totals for revenue, sum of (line.qty × inventory.cost) for COGS,
// and sum of customer-tagged vendor bills in [issue-30d, issue+60d] for
// "other expenses" — just summed across every matching invoice.

const SORTS = {
  date: invoices.issueDate,
  number: invoices.invoiceNumber,
  revenue: invoices.subtotal,
  total: invoices.totalAmount,
} as const;

type InvoiceLite = {
  id: string;
  customerId: string | null;
  issueDate: string | null;
};

// Sales-tax pass-through line items collected from the customer (e.g. Missouri
// "Users Charge"). Not revenue, not COGS — gets remitted to the state. Excluded
// from profit math; reported separately so the totals still tie to the invoice.
const TAX_PASSTHROUGH_RE = /\buser(?:'?s)?\s*charge\b|\bsales\s*tax\b|\buse\s*tax\b/i;
function isTaxPassthrough(...texts: Array<string | null | undefined>): boolean {
  for (const t of texts) {
    if (t && TAX_PASSTHROUGH_RE.test(t)) return true;
  }
  return false;
}

// Compute per-invoice revenue + cogs + billable + taxPassthrough for a set of invoices.
async function enrichWithPL(orgId: string, invs: InvoiceLite[]) {
  type PerInvoice = { revenue: number; cogs: number; billable: number; taxPassthrough: number };
  const perInv = new Map<string, PerInvoice>();
  for (const i of invs) perInv.set(i.id, { revenue: 0, cogs: 0, billable: 0, taxPassthrough: 0 });
  if (invs.length === 0) return perInv;

  const invoiceIds = invs.map((i) => i.id);
  const customerIds = [...new Set(invs.map((i) => i.customerId).filter(Boolean) as string[])];

  // Bulk pull line items for these invoices
  const lineRows = await db
    .select({
      invoiceId: invoiceLineItems.invoiceId,
      qbItemId: invoiceLineItems.qbItemId,
      description: invoiceLineItems.description,
      quantity: invoiceLineItems.quantity,
      total: invoiceLineItems.total,
    })
    .from(invoiceLineItems)
    .where(inArray(invoiceLineItems.invoiceId, invoiceIds));

  // Cost map + name map for the qbItemIds touched. Name is used so a tax
  // pass-through item still gets recognized when the line description is empty.
  const qbItemIds = [...new Set(lineRows.map((l) => l.qbItemId).filter(Boolean) as string[])];
  const itemRows = qbItemIds.length > 0
    ? await db
        .select({ qbItemId: inventoryItems.qbItemId, name: inventoryItems.name, cost: inventoryItems.cost })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.orgId, orgId), inArray(inventoryItems.qbItemId, qbItemIds)))
    : [];
  const costByQb = new Map<string, number>();
  const nameByQb = new Map<string, string>();
  for (const c of itemRows) {
    if (!c.qbItemId) continue;
    costByQb.set(c.qbItemId, c.cost != null ? Number(c.cost) : 0);
    if (c.name) nameByQb.set(c.qbItemId, c.name);
  }

  // Per-invoice revenue + qbItemId set + line bag for downstream COGS attribution.
  // Tax pass-through lines are bucketed separately and do NOT contribute to
  // revenue or to the qbItem set used for bill-matching.
  type LineRow = (typeof lineRows)[number];
  const qbItemsByInv = new Map<string, Set<string>>();
  const linesByInv = new Map<string, LineRow[]>();
  for (const li of lineRows) {
    const inv = perInv.get(li.invoiceId);
    if (!inv) continue;
    const itemName = li.qbItemId ? nameByQb.get(li.qbItemId) : undefined;
    if (isTaxPassthrough(li.description, itemName)) {
      inv.taxPassthrough += Number(li.total ?? 0);
      continue;
    }
    inv.revenue += Number(li.total ?? 0);
    if (li.qbItemId) {
      const s = qbItemsByInv.get(li.invoiceId) || new Set<string>();
      s.add(li.qbItemId);
      qbItemsByInv.set(li.invoiceId, s);
    }
    const arr = linesByInv.get(li.invoiceId) || [];
    arr.push(li);
    linesByInv.set(li.invoiceId, arr);
  }

  // Bills attributed: bucket bills by customer once, then for each invoice
  // split bills in [issueDate-30d, issueDate+60d] into:
  //   - matched: bill line whose qbItemId is on this invoice → counts as COGS
  //     for the matching invoice line (replaces inventoryItems.cost × qty)
  //   - other: counts as billable / "other expenses"
  type BillBucket = { ts: number; amount: number; qbItemId: string | null };
  const billsByCust = new Map<string, BillBucket[]>();
  if (customerIds.length > 0) {
    const issueDates = invs.map((i) => i.issueDate).filter(Boolean) as string[];
    if (issueDates.length > 0) {
      const minDate = new Date(issueDates.reduce((a, b) => (a < b ? a : b)));
      const maxDate = new Date(issueDates.reduce((a, b) => (a > b ? a : b)));
      const windowFrom = new Date(minDate); windowFrom.setDate(windowFrom.getDate() - 30);
      const windowTo = new Date(maxDate); windowTo.setDate(windowTo.getDate() + 60);

      const billRows = await db
        .select({
          customerId: billLineItems.customerId,
          amount: billLineItems.amount,
          qbItemId: billLineItems.qbItemId,
          issueDate: bills.issueDate,
        })
        .from(billLineItems)
        .innerJoin(bills, eq(bills.id, billLineItems.billId))
        .where(and(
          eq(bills.orgId, orgId),
          inArray(billLineItems.customerId, customerIds),
          gte(bills.issueDate, windowFrom.toISOString().slice(0, 10)),
          lte(bills.issueDate, windowTo.toISOString().slice(0, 10)),
        ));

      for (const b of billRows) {
        if (!b.customerId || !b.issueDate) continue;
        const arr = billsByCust.get(b.customerId) || [];
        arr.push({
          ts: new Date(b.issueDate).getTime(),
          amount: Number(b.amount ?? 0),
          qbItemId: b.qbItemId ?? null,
        });
        billsByCust.set(b.customerId, arr);
      }
    }
  }

  // For each invoice, walk its lines and bills and split into cogs / billable.
  for (const i of invs) {
    const inv = perInv.get(i.id)!;
    const invQbIds = qbItemsByInv.get(i.id) || new Set<string>();
    const invLines = linesByInv.get(i.id) || [];
    const arr = i.customerId ? billsByCust.get(i.customerId) : undefined;
    const its = i.issueDate ? new Date(i.issueDate).getTime() : null;
    const lo = its != null ? its - 30 * 86400_000 : null;
    const hi = its != null ? its + 60 * 86400_000 : null;

    // Sum matched bill amounts per qbItemId for this invoice
    const matchedByQb = new Map<string, number>();
    if (arr && lo != null && hi != null) {
      for (const b of arr) {
        if (b.ts < lo || b.ts > hi) continue;
        if (b.qbItemId && invQbIds.has(b.qbItemId)) {
          matchedByQb.set(b.qbItemId, (matchedByQb.get(b.qbItemId) ?? 0) + b.amount);
        } else {
          inv.billable += b.amount;
        }
      }
    }

    // Now COGS: for each line, prefer matched bill amount over inventory cost.
    // For lines sharing a qbItemId, the matched amount has already been summed
    // — give the entire matched amount to that qbItemId once (not per line).
    const consumedQb = new Set<string>();
    for (const li of invLines) {
      const qty = Number(li.quantity ?? 0);
      if (li.qbItemId && matchedByQb.has(li.qbItemId)) {
        if (!consumedQb.has(li.qbItemId)) {
          inv.cogs += matchedByQb.get(li.qbItemId)!;
          consumedQb.add(li.qbItemId);
        }
        // additional lines for the same item contribute 0 — bill already counted
      } else {
        const cost = li.qbItemId ? (costByQb.get(li.qbItemId) ?? 0) : 0;
        inv.cogs += qty * cost;
      }
    }
  }

  return perInv;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const status = searchParams.get('status') || '';
    const customerId = searchParams.get('customerId') || '';
    const since = searchParams.get('since') || '';
    const until = searchParams.get('until') || '';
    const profitFilter = searchParams.get('profitFilter') || 'all';
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
      where.push(or(ilike(invoices.invoiceNumber, like), ilike(invoices.notes, like)));
    }

    // ALL invoices in the filter — used for the window totals
    const allInWindow = await db
      .select({
        id: invoices.id,
        customerId: invoices.customerId,
        issueDate: invoices.issueDate,
        subtotal: invoices.subtotal,
        taxAmount: invoices.taxAmount,
        balance: invoices.balance,
      })
      .from(invoices)
      .where(and(...where));

    const totalCount = allInWindow.length;

    // Compute P&L for the entire filter window (for banner)
    const windowPL = await enrichWithPL(
      org.id,
      allInWindow.map((i) => ({ id: i.id, customerId: i.customerId, issueDate: i.issueDate })),
    );

    let windowRevenue = 0;
    let windowCogs = 0;
    let windowBillable = 0;
    let windowTaxPassthrough = 0;
    let windowTax = 0;
    let windowBalance = 0;
    let unprofitableCount = 0;
    let marginCount = 0;
    let marginSum = 0;
    let bestProfit = -Infinity;
    let worstProfit = Infinity;
    for (const inv of allInWindow) {
      const pl = windowPL.get(inv.id) || { revenue: 0, cogs: 0, billable: 0, taxPassthrough: 0 };
      windowRevenue += pl.revenue;
      windowCogs += pl.cogs;
      windowBillable += pl.billable;
      windowTaxPassthrough += pl.taxPassthrough;
      windowTax += Number(inv.taxAmount ?? 0);
      windowBalance += Number(inv.balance ?? 0);
      const profit = pl.revenue - pl.cogs - pl.billable;
      if (profit < 0) unprofitableCount++;
      if (profit > bestProfit) bestProfit = profit;
      if (profit < worstProfit) worstProfit = profit;
      if (pl.revenue > 0) {
        marginCount++;
        marginSum += (profit / pl.revenue) * 100;
      }
    }
    const windowProfit = windowRevenue - windowCogs - windowBillable;
    const windowMargin = windowRevenue > 0 ? (windowProfit / windowRevenue) * 100 : null;

    // Now the paginated table rows
    const sortCol = SORTS[sort] ?? invoices.issueDate;
    const pageRows = await db
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

    // Per-row P&L for the page rows (using the same enrich function but only
    // for the page subset — fewer queries than re-running the whole thing)
    const pagePL = await enrichWithPL(
      org.id,
      pageRows.map((r) => ({ id: r.invoice.id, customerId: r.invoice.customerId, issueDate: r.invoice.issueDate })),
    );

    let items = pageRows.map(({ invoice: inv, customerId: cid, customerName }) => {
      const pl = pagePL.get(inv.id) || { revenue: 0, cogs: 0, billable: 0, taxPassthrough: 0 };
      const tax = Number(inv.taxAmount ?? 0);
      const profit = pl.revenue - pl.cogs - pl.billable;
      const margin = pl.revenue > 0 ? (profit / pl.revenue) * 100 : null;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        status: inv.status,
        customerId: cid,
        customerName,
        revenue: pl.revenue,
        taxPassthrough: pl.taxPassthrough,
        tax,
        billed: pl.revenue + pl.taxPassthrough + tax,
        cogs: pl.cogs,
        billable: pl.billable,
        profit,
        margin,
        balance: Number(inv.balance ?? 0),
      };
    });

    if (profitFilter === 'unprofitable') items = items.filter((i) => i.profit < 0);
    if (profitFilter === 'negativeMargin') items = items.filter((i) => i.margin != null && i.margin < 0);

    return NextResponse.json({
      items,
      page,
      limit,
      totalCount,
      windowStats: {
        invoiceCount: allInWindow.length,
        revenue: windowRevenue,
        taxPassthrough: windowTaxPassthrough,
        tax: windowTax,
        billed: windowRevenue + windowTaxPassthrough + windowTax,
        cogs: windowCogs,
        billable: windowBillable,
        totalCost: windowCogs + windowBillable,
        profit: windowProfit,
        margin: windowMargin,
        avgMarginPerInvoice: marginCount > 0 ? marginSum / marginCount : null,
        unprofitableCount,
        balance: windowBalance,
        bestProfit: bestProfit === -Infinity ? null : bestProfit,
        worstProfit: worstProfit === Infinity ? null : worstProfit,
      },
    });
  } catch (err: any) {
    console.error('Profit-by-job report failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
