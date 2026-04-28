import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  invoices,
  invoiceLineItems,
  customers,
  inventoryItems,
  bills,
  billLineItems,
  vendors,
} from '@/db';
import { and, eq, sql, desc, asc, inArray, gte, lte } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// Detail P&L for a single invoice ("job")

// Lines that are sales-tax pass-through (collected from the customer, remitted
// to the state — not revenue, not COGS). The user invoices these as a regular
// line item ("Users Charge") instead of QB's tax engine, so we strip them out
// of the profit math and report them as a separate "Tax pass-through" bucket.
const TAX_PASSTHROUGH_RE = /\buser(?:'?s)?\s*charge\b|\bsales\s*tax\b|\buse\s*tax\b/i;
function isTaxPassthrough(...texts: Array<string | null | undefined>): boolean {
  for (const t of texts) {
    if (t && TAX_PASSTHROUGH_RE.test(t)) return true;
  }
  return false;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateDefaultOrg();

    const [row] = await db
      .select({
        invoice: invoices,
        customerId: customers.id,
        customerFirst: customers.firstName,
        customerLast: customers.lastName,
        customerCompany: customers.companyName,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .where(and(eq(invoices.orgId, org.id), eq(invoices.id, id)))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    const inv = row.invoice;

    // Pull line items + per-item cost
    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id))
      .orderBy(asc(invoiceLineItems.order));

    const qbItemIds = [...new Set(lines.map((l) => l.qbItemId).filter(Boolean) as string[])];
    const itemRows = qbItemIds.length > 0
      ? await db
          .select()
          .from(inventoryItems)
          .where(and(eq(inventoryItems.orgId, org.id), inArray(inventoryItems.qbItemId, qbItemIds)))
      : [];
    const itemByQb = new Map(itemRows.map((i) => [i.qbItemId!, i]));

    // Pull customer-tagged bills in [issueDate-30d, issueDate+60d] FIRST, so we
    // can use a matching bill line's actual amount as a line's COGS (more
    // accurate than the static inventory cost) and exclude it from "other
    // expenses" (otherwise the same bill is counted twice).
    type BillExp = {
      billId: string; billNumber: string | null; issueDate: string | null;
      vendorId: string | null; vendorName: string | null;
      description: string | null; amount: number; qbItemId: string | null;
      lineId: string;
    };
    let allBillLines: BillExp[] = [];
    if (inv.customerId && inv.issueDate) {
      const ts = new Date(inv.issueDate);
      const lo = new Date(ts); lo.setDate(lo.getDate() - 30);
      const hi = new Date(ts); hi.setDate(hi.getDate() + 60);
      const raw = await db
        .select({
          billId: bills.id,
          billNumber: bills.billNumber,
          issueDate: bills.issueDate,
          vendorId: vendors.id,
          vendorName: vendors.displayName,
          description: billLineItems.description,
          amount: billLineItems.amount,
          qbItemId: billLineItems.qbItemId,
          lineId: billLineItems.id,
        })
        .from(billLineItems)
        .innerJoin(bills, eq(bills.id, billLineItems.billId))
        .leftJoin(vendors, eq(vendors.id, bills.vendorId))
        .where(and(
          eq(bills.orgId, org.id),
          eq(billLineItems.customerId, inv.customerId),
          gte(bills.issueDate, lo.toISOString().slice(0, 10)),
          lte(bills.issueDate, hi.toISOString().slice(0, 10)),
        ))
        .orderBy(desc(bills.issueDate));
      allBillLines = raw.map((r) => ({
        billId: r.billId,
        billNumber: r.billNumber,
        issueDate: r.issueDate,
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        description: r.description,
        amount: Number(r.amount ?? 0),
        qbItemId: r.qbItemId,
        lineId: r.lineId,
      }));
    }

    // Group bill amounts and consume bill-line ids for each qbItemId on the invoice
    const invoiceQbIds = new Set(lines.map((l) => l.qbItemId).filter(Boolean) as string[]);
    const billAmountByQb = new Map<string, number>();
    const consumedBillLineIds = new Set<string>();
    for (const b of allBillLines) {
      if (!b.qbItemId || !invoiceQbIds.has(b.qbItemId)) continue;
      billAmountByQb.set(b.qbItemId, (billAmountByQb.get(b.qbItemId) ?? 0) + b.amount);
      consumedBillLineIds.add(b.lineId);
    }
    // Total qty per qbItemId on the invoice — used to spread the bill cost
    // proportionally if the same item appears on multiple lines.
    const invoiceQtyByQb = new Map<string, number>();
    for (const l of lines) {
      if (!l.qbItemId) continue;
      invoiceQtyByQb.set(l.qbItemId, (invoiceQtyByQb.get(l.qbItemId) ?? 0) + Number(l.quantity ?? 0));
    }

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalTaxPassthrough = 0;
    const lineDetail = lines.map((l) => {
      const qty = Number(l.quantity ?? 0);
      const unitPrice = Number(l.unitPrice ?? 0);
      const lineTotal = Number(l.total ?? 0);
      const item = l.qbItemId ? itemByQb.get(l.qbItemId) : undefined;
      const taxPassthrough = isTaxPassthrough(l.description, item?.name);
      if (taxPassthrough) {
        totalTaxPassthrough += lineTotal;
        return {
          id: l.id,
          order: l.order ?? 0,
          description: l.description,
          qbItemId: l.qbItemId,
          itemName: item?.name ?? null,
          itemSku: item?.sku ?? null,
          quantity: qty,
          unitPrice,
          unitCost: 0,
          total: lineTotal,
          cost: 0,
          costSource: 'inventory' as const,
          profit: 0,
          margin: null,
          isTaxPassthrough: true,
        };
      }
      // Prefer the matching bill amount (actual paid cost) over the static
      // inventory cost. Spread proportionally by qty when the same item is
      // on more than one line.
      let lineCost: number;
      let costSource: 'bill' | 'inventory' = 'inventory';
      const billTotalForQb = l.qbItemId ? billAmountByQb.get(l.qbItemId) : undefined;
      if (billTotalForQb != null && billTotalForQb > 0) {
        const totalQty = (l.qbItemId && invoiceQtyByQb.get(l.qbItemId)) || 0;
        lineCost = totalQty > 0 ? billTotalForQb * (qty / totalQty) : billTotalForQb;
        costSource = 'bill';
      } else {
        const unitCost = item?.cost != null ? Number(item.cost) : 0;
        lineCost = qty * unitCost;
      }
      const unitCost = qty > 0 ? lineCost / qty : (item?.cost != null ? Number(item.cost) : 0);
      const lineProfit = lineTotal - lineCost;
      const lineMargin = lineTotal > 0 ? (lineProfit / lineTotal) * 100 : null;
      totalRevenue += lineTotal;
      totalCogs += lineCost;
      return {
        id: l.id,
        order: l.order ?? 0,
        description: l.description,
        qbItemId: l.qbItemId,
        itemName: item?.name ?? null,
        itemSku: item?.sku ?? null,
        quantity: qty,
        unitPrice,
        unitCost,
        total: lineTotal,
        cost: lineCost,
        costSource,
        profit: lineProfit,
        margin: lineMargin,
        isTaxPassthrough: false,
      };
    });

    // Other expenses = bill lines NOT consumed as a line's COGS above.
    const billExpenses = allBillLines.filter((b) => !consumedBillLineIds.has(b.lineId));
    const totalBillable = billExpenses.reduce((s, b) => s + b.amount, 0);

    const tax = Number(inv.taxAmount ?? 0);
    const billed = totalRevenue + totalTaxPassthrough + tax;
    const totalCost = totalCogs + totalBillable;
    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : null;

    const customerName =
      row.customerCompany ||
      (row.customerFirst ? `${row.customerFirst} ${row.customerLast || ''}`.trim() : null);

    return NextResponse.json({
      invoice: {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        status: inv.status,
        balance: Number(inv.balance ?? 0),
        notes: inv.notes,
      },
      customer: row.customerId ? {
        id: row.customerId,
        name: customerName,
        email: row.customerEmail,
        phone: row.customerPhone,
      } : null,
      lines: lineDetail,
      billExpenses,
      summary: {
        revenue: totalRevenue,
        taxPassthrough: totalTaxPassthrough,
        tax,
        billed,
        cogs: totalCogs,
        billable: totalBillable,
        totalCost,
        profit,
        margin,
        balance: Number(inv.balance ?? 0),
      },
    });
  } catch (err: any) {
    console.error('Profit-by-job detail failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
