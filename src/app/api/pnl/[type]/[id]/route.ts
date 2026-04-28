import { NextRequest, NextResponse } from "next/server";
import {
  db,
  invoices,
  invoiceLineItems,
  estimates,
  estimateLineItems,
  inventoryItems,
  bills,
  billLineItems,
  customers,
} from "@/db";
import { and, eq, inArray, gte, lte, asc, desc } from "drizzle-orm";
import { getOrCreateDefaultOrg } from "@/lib/org";

// Per-document P&L (used by the P&L button on /estimates and /invoices).
// type = "invoice" | "estimate"
//
// Splits revenue + cost into product vs labor lines and computes Scott's
// commission: 15% of product profit + 20% of labor revenue (no payroll cost
// data, so labor "profit" equals labor revenue here).

const LABOR_RE = /services?[:/]|\binstall(?:ation|ed|ing)?\b|\blabor\b|\bclean\b|\brepair\b|service\s*charge|tuck\s*point|tuckpoint|\bsweep\b|inspection|delivery|chimney\s*repair|reline|relining|parge/i;
const TAX_PASSTHROUGH_RE = /\buser(?:'?s)?\s*charge\b|\bsales\s*tax\b|\buse\s*tax\b/i;

type Bucket = "labor" | "product" | "tax";
function bucketLine(name: string | null, desc: string | null): Bucket {
  const t = `${name ?? ""} ${desc ?? ""}`;
  if (TAX_PASSTHROUGH_RE.test(t)) return "tax";
  if (LABOR_RE.test(t)) return "labor";
  return "product";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const { type, id } = await params;
    if (type !== "invoice" && type !== "estimate") {
      return NextResponse.json({ error: 'type must be "invoice" or "estimate"' }, { status: 400 });
    }

    const org = await getOrCreateDefaultOrg();

    // Pull header + customer + lines
    let header: {
      docId: string;
      docNumber: string | null;
      issueDate: string | null;
      status: string | null;
      total: number;
      balance: number;
      customerId: string | null;
      customerName: string | null;
    } | null = null;
    let lines: Array<{
      id: string;
      description: string | null;
      qbItemId: string | null;
      quantity: number;
      unitPrice: number;
      total: number;
      order: number;
    }> = [];

    if (type === "invoice") {
      const [row] = await db
        .select({
          invoice: invoices,
          customerId: customers.id,
          customerFirst: customers.firstName,
          customerLast: customers.lastName,
          customerCompany: customers.companyName,
        })
        .from(invoices)
        .leftJoin(customers, eq(customers.id, invoices.customerId))
        .where(and(eq(invoices.orgId, org.id), eq(invoices.id, id)))
        .limit(1);
      if (!row) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      const inv = row.invoice;
      const liRows = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, id))
        .orderBy(asc(invoiceLineItems.order));
      lines = liRows.map((l) => ({
        id: l.id,
        description: l.description,
        qbItemId: l.qbItemId,
        quantity: Number(l.quantity ?? 0),
        unitPrice: Number(l.unitPrice ?? 0),
        total: Number(l.total ?? 0),
        order: l.order,
      }));
      header = {
        docId: inv.id,
        docNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        status: inv.status,
        total: Number(inv.totalAmount ?? 0),
        balance: Number(inv.balance ?? 0),
        customerId: row.customerId,
        customerName:
          row.customerCompany ||
          [row.customerFirst, row.customerLast].filter(Boolean).join(" ").trim() ||
          null,
      };
    } else {
      // estimate — id may be either the local UUID or the QB estimate id
      // (numeric/short string). Postgres rejects a non-UUID for the uuid
      // column with a query error before we could fall back, so detect the
      // shape up front and pick the right column.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const headerRows = await db
        .select({
          estimate: estimates,
          customerId: customers.id,
          customerFirst: customers.firstName,
          customerLast: customers.lastName,
          customerCompany: customers.companyName,
        })
        .from(estimates)
        .leftJoin(customers, eq(customers.id, estimates.customerId))
        .where(and(
          eq(estimates.orgId, org.id),
          isUuid ? eq(estimates.id, id) : eq(estimates.qbEstimateId, id),
        ))
        .limit(1);
      const headerRow = headerRows[0] ?? null;
      if (!headerRow) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

      const est = headerRow.estimate;
      const elRows = await db
        .select()
        .from(estimateLineItems)
        .where(eq(estimateLineItems.estimateId, est.id))
        .orderBy(asc(estimateLineItems.order));
      lines = elRows.map((l) => ({
        id: l.id,
        description: l.description,
        qbItemId: l.qbItemId,
        quantity: Number(l.quantity ?? 0),
        unitPrice: Number(l.unitPrice ?? 0),
        total: Number(l.total ?? 0),
        order: l.order ?? 0,
      }));
      header = {
        docId: est.id,
        docNumber: est.estimateNumber,
        issueDate: est.issueDate,
        status: est.status,
        total: Number(est.totalAmount ?? 0),
        balance: 0,
        customerId: headerRow.customerId,
        customerName:
          headerRow.customerCompany ||
          [headerRow.customerFirst, headerRow.customerLast].filter(Boolean).join(" ").trim() ||
          null,
      };
    }

    // ── Resolve item names + costs via inventory_items ──
    const qbItemIds = [...new Set(lines.map((l) => l.qbItemId).filter(Boolean) as string[])];
    const itemRows = qbItemIds.length > 0
      ? await db
          .select({
            qbItemId: inventoryItems.qbItemId,
            name: inventoryItems.name,
            cost: inventoryItems.cost,
          })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.orgId, org.id), inArray(inventoryItems.qbItemId, qbItemIds)))
      : [];
    const itemByQb = new Map(itemRows.map((r) => [r.qbItemId!, r]));

    // ── For invoices, prefer matching customer-tagged bill amounts as COGS ──
    const billAmountByQb = new Map<string, number>();
    const invoiceQtyByQb = new Map<string, number>();
    if (type === "invoice" && header?.customerId && header?.issueDate) {
      const ts = new Date(header.issueDate);
      const lo = new Date(ts); lo.setDate(lo.getDate() - 30);
      const hi = new Date(ts); hi.setDate(hi.getDate() + 60);
      const billRaw = await db
        .select({
          amount: billLineItems.amount,
          qbItemId: billLineItems.qbItemId,
        })
        .from(billLineItems)
        .innerJoin(bills, eq(bills.id, billLineItems.billId))
        .where(and(
          eq(bills.orgId, org.id),
          eq(billLineItems.customerId, header.customerId),
          gte(bills.issueDate, lo.toISOString().slice(0, 10)),
          lte(bills.issueDate, hi.toISOString().slice(0, 10)),
        ))
        .orderBy(desc(bills.issueDate));
      const invQbIds = new Set(qbItemIds);
      for (const b of billRaw) {
        if (!b.qbItemId || !invQbIds.has(b.qbItemId)) continue;
        billAmountByQb.set(b.qbItemId, (billAmountByQb.get(b.qbItemId) ?? 0) + Number(b.amount ?? 0));
      }
      for (const l of lines) {
        if (!l.qbItemId) continue;
        invoiceQtyByQb.set(l.qbItemId, (invoiceQtyByQb.get(l.qbItemId) ?? 0) + l.quantity);
      }
    }

    // ── Per-line P&L ──
    let productRevenue = 0;
    let productCogs = 0;
    let laborRevenue = 0;
    let taxPassthrough = 0;

    const lineDetail = lines.map((l) => {
      const item = l.qbItemId ? itemByQb.get(l.qbItemId) : undefined;
      const itemName = item?.name ?? null;
      const bucket = bucketLine(itemName, l.description);
      if (bucket === "tax") {
        taxPassthrough += l.total;
        return {
          id: l.id,
          description: l.description,
          itemName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          total: l.total,
          cost: 0,
          profit: 0,
          bucket,
          costSource: null as "bill" | "inventory" | null,
        };
      }
      if (bucket === "labor") {
        laborRevenue += l.total;
        return {
          id: l.id,
          description: l.description,
          itemName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          total: l.total,
          cost: 0,
          profit: l.total,
          bucket,
          costSource: null,
        };
      }
      // product
      let lineCost: number;
      let costSource: "bill" | "inventory" = "inventory";
      const billTotalForQb = l.qbItemId ? billAmountByQb.get(l.qbItemId) : undefined;
      if (billTotalForQb != null && billTotalForQb > 0) {
        const totalQty = (l.qbItemId && invoiceQtyByQb.get(l.qbItemId)) || 0;
        lineCost = totalQty > 0 ? billTotalForQb * (l.quantity / totalQty) : billTotalForQb;
        costSource = "bill";
      } else {
        const unitCost = item?.cost != null ? Number(item.cost) : 0;
        lineCost = l.quantity * unitCost;
      }
      productRevenue += l.total;
      productCogs += lineCost;
      return {
        id: l.id,
        description: l.description,
        itemName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        total: l.total,
        cost: Number(lineCost.toFixed(2)),
        profit: Number((l.total - lineCost).toFixed(2)),
        bucket,
        costSource,
      };
    });

    const productProfit = productRevenue - productCogs;
    const totalRevenue = productRevenue + laborRevenue;
    const totalProfit = productProfit + laborRevenue;
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null;

    const scottProductShare = Number((productProfit * 0.15).toFixed(2));
    const scottLaborShare = Number((laborRevenue * 0.20).toFixed(2));
    const scottTotal = Number((scottProductShare + scottLaborShare).toFixed(2));
    const ownerNet = Number((totalProfit - scottTotal).toFixed(2));

    return NextResponse.json({
      type,
      header,
      lines: lineDetail,
      summary: {
        productRevenue: Number(productRevenue.toFixed(2)),
        productCogs: Number(productCogs.toFixed(2)),
        productProfit: Number(productProfit.toFixed(2)),
        laborRevenue: Number(laborRevenue.toFixed(2)),
        taxPassthrough: Number(taxPassthrough.toFixed(2)),
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalProfit: Number(totalProfit.toFixed(2)),
        margin: margin == null ? null : Number(margin.toFixed(2)),
      },
      splits: {
        scottProductShare,
        scottLaborShare,
        scottTotal,
        ownerNet,
        rates: { product: 0.15, labor: 0.20 },
      },
    });
  } catch (err: any) {
    console.error("Per-document P&L failed:", err);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
