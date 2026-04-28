import { NextRequest, NextResponse } from "next/server";
import { db, estimates, estimateLineItems, customers } from "@/db";
import { and, eq, desc, asc, inArray } from "drizzle-orm";
import { getOrCreateDefaultOrg } from "@/lib/org";

// Reads estimates from the local DB (synced from QuickBooks) and returns them
// in the QB shape the existing estimate builder UI consumes. Avoids hitting
// the QuickBooks API on every page load.
//
// Same pattern as /api/inventory: use the DB for reads, only hit QB when the
// user explicitly requests a refresh (POST /api/quickbooks/sync/estimates).

type QBLine = {
  Id?: string;
  Amount?: number;
  Description?: string;
  DetailType?: string;
  SalesItemLineDetail?: {
    ItemRef?: { value?: string; name?: string };
    Qty?: number;
    UnitPrice?: number;
  };
};

type QBEstimate = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  ExpirationDate?: string;
  PrivateNote?: string;
  BillEmail?: { Address?: string };
  CustomerRef?: { value?: string; name?: string };
  Line?: QBLine[];
  TotalAmt?: number;
  status?: string;
};

const customerDisplay = (first: string | null, last: string | null, company: string | null) =>
  company || [first, last].filter(Boolean).join(" ").trim() || null;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const limit = Math.min(1000, Math.max(20, parseInt(searchParams.get("limit") || "300", 10)));
    const org = await getOrCreateDefaultOrg();

    const where = id
      ? and(eq(estimates.orgId, org.id), eq(estimates.qbEstimateId, id))
      : eq(estimates.orgId, org.id);

    const headerRows = await db
      .select({
        id: estimates.id,
        qbEstimateId: estimates.qbEstimateId,
        estimateNumber: estimates.estimateNumber,
        status: estimates.status,
        issueDate: estimates.issueDate,
        expirationDate: estimates.expirationDate,
        privateNote: estimates.privateNote,
        billEmail: estimates.billEmail,
        totalAmount: estimates.totalAmount,
        customerLocalId: estimates.customerId,
        qbCustomerId: customers.qbCustomerId,
        customerFirst: customers.firstName,
        customerLast: customers.lastName,
        customerCompany: customers.companyName,
      })
      .from(estimates)
      .leftJoin(customers, eq(customers.id, estimates.customerId))
      .where(where)
      .orderBy(desc(estimates.issueDate), desc(estimates.updatedAt))
      .limit(id ? 1 : limit);

    if (id && headerRows.length === 0) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    const localIds = headerRows.map((h) => h.id);
    const lineRows = localIds.length
      ? await db
          .select({
            estimateId: estimateLineItems.estimateId,
            qbItemId: estimateLineItems.qbItemId,
            description: estimateLineItems.description,
            quantity: estimateLineItems.quantity,
            unitPrice: estimateLineItems.unitPrice,
            total: estimateLineItems.total,
            order: estimateLineItems.order,
          })
          .from(estimateLineItems)
          .where(inArray(estimateLineItems.estimateId, localIds))
          .orderBy(asc(estimateLineItems.order))
      : [];

    const linesByEst = new Map<string, QBLine[]>();
    for (const r of lineRows) {
      const existing = linesByEst.get(r.estimateId) || [];
      existing.push({
        Id: String(r.order ?? existing.length + 1),
        Amount: Number(r.total ?? 0),
        Description: r.description ?? undefined,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          ItemRef: r.qbItemId ? { value: r.qbItemId } : undefined,
          Qty: Number(r.quantity ?? 1),
          UnitPrice: Number(r.unitPrice ?? 0),
        },
      });
      linesByEst.set(r.estimateId, existing);
    }

    const out: QBEstimate[] = headerRows.map((h) => ({
      Id: h.qbEstimateId || h.id,
      DocNumber: h.estimateNumber || undefined,
      TxnDate: h.issueDate || undefined,
      ExpirationDate: h.expirationDate || undefined,
      PrivateNote: h.privateNote || undefined,
      BillEmail: h.billEmail ? { Address: h.billEmail } : undefined,
      CustomerRef: {
        value: h.qbCustomerId || h.customerLocalId || undefined,
        name: customerDisplay(h.customerFirst, h.customerLast, h.customerCompany) || undefined,
      },
      Line: linesByEst.get(h.id) || [],
      TotalAmt: Number(h.totalAmount ?? 0),
      status: h.status ?? undefined,
    }));

    if (id) return NextResponse.json({ estimate: out[0] });
    return NextResponse.json({ estimates: out, total: out.length });
  } catch (err: any) {
    console.error("Failed to read local estimates:", err);
    return NextResponse.json(
      { estimates: [], total: 0, error: err?.message || "Failed to fetch estimates" },
      { status: 500 },
    );
  }
}
