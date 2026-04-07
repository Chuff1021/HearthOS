import { NextResponse } from "next/server";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { getClientFromTokens } from "@/lib/quickbooks/sync";
import postgres from "postgres";

export const maxDuration = 300;

// POST — pull QB bills + items, build cost history, store in DB
export async function POST() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "No database" }, { status: 500 });
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    const org = await getOrCreateDefaultOrg();
    if (!org.qbAccessToken || !org.qbRefreshToken || !org.qbRealmId) {
      await sql.end();
      return NextResponse.json({ error: "QuickBooks not connected" }, { status: 401 });
    }
    const client = getClientFromTokens(org.qbAccessToken, org.qbRefreshToken, org.qbRealmId);

    // 24 months back from today
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 24);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    // ── Fetch paid bills ──
    let bills: any[] = [];
    try {
      bills = await (client as any).queryAll(
        `SELECT * FROM Bill WHERE TxnDate >= '${cutoffStr}' ORDERBY TxnDate DESC`
      );
    } catch (e) {
      try {
        bills = await (client as any).queryAll("SELECT * FROM Bill ORDERBY TxnDate DESC");
      } catch {}
    }

    // ── Fetch current QB Items (for PurchaseCost + UnitPrice) ──
    let qbItems: any[] = [];
    try {
      qbItems = await (client as any).queryAll("SELECT * FROM Item WHERE Active = true");
    } catch {}

    // Build name → current cost/price map
    const itemInfoMap: Record<string, { purchaseCost: number; salePrice: number; sku: string; fullName: string }> = {};
    for (const item of qbItems) {
      const name = item.Name || "";
      if (!name) continue;
      itemInfoMap[name] = {
        purchaseCost: Number(item.PurchaseCost || 0),
        salePrice: Number(item.UnitPrice || 0),
        sku: item.Sku || "",
        fullName: item.FullyQualifiedName || name,
      };
    }

    // ── Process bills — only paid (Balance = 0) ──
    const rawHistory: Record<string, {
      name: string;
      costs: number[];
      qtys: number[];
      dates: string[];
      vendors: string[];
    }> = {};

    let billsTotal = 0;
    let billsPaid = 0;

    for (const bill of bills) {
      billsTotal++;
      if (Number(bill.Balance ?? 1) !== 0) continue; // skip unpaid
      billsPaid++;

      const vendor = bill.VendorRef?.name || "Unknown Vendor";
      const date = bill.TxnDate || "";
      const lines = (bill.Line || []).filter(
        (l: any) => l.DetailType === "ItemBasedExpenseLineDetail"
      );

      for (const line of lines) {
        const detail = line.ItemBasedExpenseLineDetail || {};
        const name = detail.ItemRef?.name || "";
        if (!name) continue;
        const unitCost = Number(detail.UnitPrice || 0);
        const qty = Number(detail.Qty || 1);
        if (unitCost <= 0) continue;

        if (!rawHistory[name]) {
          rawHistory[name] = { name, costs: [], qtys: [], dates: [], vendors: [] };
        }
        rawHistory[name].costs.push(unitCost);
        rawHistory[name].qtys.push(qty);
        rawHistory[name].dates.push(date);
        if (!rawHistory[name].vendors.includes(vendor)) rawHistory[name].vendors.push(vendor);
      }
    }

    // ── Build summary with variance ──
    const costSummary: Record<string, any> = {};
    for (const [name, data] of Object.entries(rawHistory)) {
      if (data.costs.length === 0) continue;
      const sortedByDate = data.costs; // already date-desc from QB query
      const avgCost = Number((data.costs.reduce((a, b) => a + b, 0) / data.costs.length).toFixed(2));
      const minCost = Math.min(...data.costs);
      const maxCost = Math.max(...data.costs);
      const mostRecentCost = sortedByDate[0];
      const info = itemInfoMap[name] || { purchaseCost: 0, salePrice: 0, sku: "", fullName: name };

      // variance = what we actually paid avg vs what QB has as PurchaseCost
      // positive = we're paying MORE than QB thinks (QB is understating cost)
      const variance = Number((avgCost - info.purchaseCost).toFixed(2));
      const variancePct = info.purchaseCost > 0
        ? Number(((variance / info.purchaseCost) * 100).toFixed(1))
        : null;

      // gross margin based on avg cost vs sale price
      const margin = info.salePrice > 0 && avgCost > 0
        ? Number((((info.salePrice - avgCost) / info.salePrice) * 100).toFixed(1))
        : null;

      costSummary[name] = {
        name,
        sku: info.sku,
        fullName: info.fullName,
        avgCost,
        minCost,
        maxCost,
        mostRecentCost,
        lastPurchaseDate: data.dates[0] || "",
        timesOrdered: data.costs.length,
        vendors: data.vendors,
        qbCurrentCost: info.purchaseCost,
        salePrice: info.salePrice,
        variance,
        variancePct,
        margin,
      };
    }

    // ── Store in DB ──
    await sql`
      CREATE TABLE IF NOT EXISTS estimator_knowledge (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `;
    await sql`
      INSERT INTO estimator_knowledge (id, type, data)
      VALUES (${"cost-history"}, ${"cost-history"}, ${JSON.stringify(costSummary)}::jsonb)
      ON CONFLICT (id) DO UPDATE
        SET data = ${JSON.stringify(costSummary)}::jsonb,
            updated_at = now()
    `;
    await sql.end();

    const items = Object.values(costSummary) as any[];
    return NextResponse.json({
      success: true,
      billsTotal,
      billsPaid,
      itemsFound: items.length,
      cutoffDate: cutoffStr,
      flagged: {
        costUnderstated: items.filter((i) => i.variance > 0 && Math.abs(i.variancePct ?? 0) >= 5).length,
        costOverstated: items.filter((i) => i.variance < 0 && Math.abs(i.variancePct ?? 0) >= 5).length,
        noQbCost: items.filter((i) => i.qbCurrentCost === 0 && i.avgCost > 0).length,
      },
    });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET — return stored cost history from DB
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "No database" }, { status: 500 });
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    const rows = await sql`
      SELECT data, updated_at FROM estimator_knowledge WHERE id = ${"cost-history"}
    `;
    await sql.end();
    if (rows.length === 0) return NextResponse.json({ items: [], updatedAt: null });
    const data = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
    return NextResponse.json({ items: Object.values(data), updatedAt: rows[0].updated_at });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
