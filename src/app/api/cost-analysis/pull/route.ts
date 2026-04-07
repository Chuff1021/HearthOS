import { NextResponse } from "next/server";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { getClientFromTokens } from "@/lib/quickbooks/sync";
import { db, organizations } from "@/db";
import { eq } from "drizzle-orm";
import postgres from "postgres";

export const maxDuration = 300;

// Paginate through any QB entity using the public queryPage() method
async function fetchAllPages(client: any, baseQuery: string, pageSize = 500): Promise<any[]> {
  const all: any[] = [];
  let startPos = 1;
  for (;;) {
    const page = await client.queryPage(
      `${baseQuery} STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`
    );
    const rows: any[] = page.rows || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    startPos += pageSize;
  }
  return all;
}

// Get QB client with automatic token refresh
async function getClient() {
  const org = await getOrCreateDefaultOrg();
  if (!org.qbAccessToken || !org.qbRefreshToken || !org.qbRealmId) {
    throw new Error("QuickBooks not connected");
  }
  let client = getClientFromTokens(org.qbAccessToken, org.qbRefreshToken, org.qbRealmId);

  async function run<T>(fn: (c: typeof client) => Promise<T>): Promise<T> {
    try {
      return await fn(client);
    } catch {
      // Token expired — refresh and retry once
      const tokens = await client.refreshAccessToken();
      await db.update(organizations).set({
        qbAccessToken: tokens.access_token,
        qbRefreshToken: tokens.refresh_token,
        qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        updatedAt: new Date(),
      }).where(eq(organizations.id, org.id));
      client = getClientFromTokens(tokens.access_token, tokens.refresh_token, org.qbRealmId!);
      return fn(client);
    }
  }

  return { run };
}

// POST — pull QB Bills + Items, build cost history, store in DB
export async function POST() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    const { run } = await getClient();

    // 24 months back
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 24);
    const cutoffStr = cutoff.toISOString().split("T")[0]; // e.g. "2024-04-07"

    // ── 1. Fetch all Bills from last 24 months ──
    let bills: any[] = [];
    let billError: string | null = null;
    try {
      bills = await run((c) =>
        fetchAllPages(c, `SELECT * FROM Bill WHERE TxnDate >= '${cutoffStr}' ORDERBY TxnDate DESC`)
      );
    } catch (e: any) {
      // Try without date filter as fallback
      try {
        bills = await run((c) =>
          fetchAllPages(c, `SELECT * FROM Bill ORDERBY TxnDate DESC`)
        );
      } catch (e2: any) {
        billError = String(e2?.message || e2);
      }
    }

    // ── 2. Fetch all active Items ──
    let qbItems: any[] = [];
    let itemError: string | null = null;
    try {
      qbItems = await run((c) =>
        fetchAllPages(c, `SELECT * FROM Item WHERE Active = true`)
      );
    } catch (e: any) {
      itemError = String(e?.message || e);
      try {
        qbItems = await run((c) => c.getItems(1000));
      } catch {}
    }

    // Build item info map: Name → { purchaseCost, salePrice, sku, fullName }
    const itemInfoMap: Record<string, {
      purchaseCost: number;
      salePrice: number;
      sku: string;
      fullName: string;
    }> = {};
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

    // ── 3. Process Bills — only paid (Balance = 0) ──
    const rawHistory: Record<string, {
      name: string;
      costs: number[];
      qtys: number[];
      dates: string[];
      vendors: string[];
    }> = {};

    let billsTotal = bills.length;
    let billsPaid = 0;
    let accountLines = 0; // bills using account-based (no item ref)

    for (const bill of bills) {
      const isPaid = Number(bill.Balance ?? 1) === 0;
      if (!isPaid) continue;
      billsPaid++;

      const vendor = bill.VendorRef?.name || "Unknown Vendor";
      const date = bill.TxnDate || "";

      for (const line of (bill.Line || [])) {
        if (line.DetailType === "ItemBasedExpenseLineDetail") {
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
          if (!rawHistory[name].vendors.includes(vendor)) {
            rawHistory[name].vendors.push(vendor);
          }
        } else if (line.DetailType === "AccountBasedExpenseLineDetail") {
          accountLines++;
        }
      }
    }

    // ── 4. Build cost summary with variance vs QB PurchaseCost ──
    const costSummary: Record<string, any> = {};
    for (const [name, data] of Object.entries(rawHistory)) {
      if (data.costs.length === 0) continue;

      const avgCost = Number(
        (data.costs.reduce((a, b) => a + b, 0) / data.costs.length).toFixed(2)
      );
      const minCost = Math.min(...data.costs);
      const maxCost = Math.max(...data.costs);
      const mostRecentCost = data.costs[0]; // sorted date desc from QB

      const info = itemInfoMap[name] || { purchaseCost: 0, salePrice: 0, sku: "", fullName: name };

      // positive variance = paying MORE than QB thinks (QB cost is too low)
      const variance = Number((avgCost - info.purchaseCost).toFixed(2));
      const variancePct = info.purchaseCost > 0
        ? Number(((variance / info.purchaseCost) * 100).toFixed(1))
        : null;

      // gross margin using avg actual cost vs sale price
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

    // ── 5. Store in DB ──
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
        SET data       = ${JSON.stringify(costSummary)}::jsonb,
            updated_at = now()
    `;
    await sql.end();

    const items = Object.values(costSummary) as any[];

    // Warn if bills were found but all lines are account-based (no item names)
    const accountOnlyWarning =
      billsPaid > 0 && items.length === 0 && accountLines > 0
        ? `Found ${billsPaid} paid bills but all ${accountLines} expense lines use account categories, not inventory items. In QuickBooks, open a bill and check if line items reference Products & Services items — if they reference expense accounts only, there is no item name to match against.`
        : null;

    return NextResponse.json({
      success: true,
      billsTotal,
      billsPaid,
      itemsFound: items.length,
      cutoffDate: cutoffStr,
      ...(accountOnlyWarning ? { warning: accountOnlyWarning } : {}),
      ...(billError ? { billError } : {}),
      ...(itemError ? { itemError } : {}),
      flagged: {
        costUnderstated: items.filter((i) => i.variance > 0 && Math.abs(i.variancePct ?? 0) >= 5).length,
        costOverstated: items.filter((i) => i.variance < 0 && Math.abs(i.variancePct ?? 0) >= 5).length,
        noQbCost: items.filter((i) => i.qbCurrentCost === 0 && i.avgCost > 0).length,
      },
    });

  } catch (err: any) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// GET — return stored cost history
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    const rows = await sql`
      SELECT data, updated_at FROM estimator_knowledge WHERE id = ${"cost-history"}
    `;
    await sql.end();
    if (rows.length === 0) return NextResponse.json({ items: [], updatedAt: null });
    const data = typeof rows[0].data === "string"
      ? JSON.parse(rows[0].data)
      : rows[0].data;
    return NextResponse.json({ items: Object.values(data), updatedAt: rows[0].updated_at });
  } catch (err: any) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
