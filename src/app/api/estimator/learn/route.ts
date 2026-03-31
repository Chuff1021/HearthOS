import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { getClientFromTokens } from "@/lib/quickbooks/sync";
import postgres from "postgres";

export const maxDuration = 300;

/**
 * Analyzes ALL QuickBooks invoices and estimates to build a pricing
 * knowledge base for the AI estimator.
 *
 * Learns:
 * - Every product/part sold with min/avg/max pricing
 * - Common component bundles (what parts go together)
 * - Install type patterns (vertical vs horizontal vs insert)
 * - Labor rates by job complexity
 * - Which venting components go with which fireplace models
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    // Get QB client
    const org = await getOrCreateDefaultOrg();
    if (!org.qbAccessToken || !org.qbRefreshToken || !org.qbRealmId) {
      await sql.end();
      return NextResponse.json({ error: "QuickBooks not connected" }, { status: 401 });
    }
    const client = getClientFromTokens(org.qbAccessToken, org.qbRefreshToken, org.qbRealmId);

    // Fetch ALL invoices
    let invoices: any[] = [];
    try {
      invoices = await (client as any).queryAll("SELECT * FROM Invoice ORDERBY TxnDate DESC");
    } catch {
      invoices = await client.getInvoices(1000);
    }

    // Fetch ALL estimates
    let estimates: any[] = [];
    try {
      estimates = await (client as any).queryAll("SELECT * FROM Estimate ORDERBY TxnDate DESC");
    } catch {
      estimates = await (client as any).getEstimates(1000);
    }

    // Combine all transactions
    const allTransactions = [
      ...invoices.map((inv: any) => ({ ...inv, _type: "invoice" })),
      ...estimates.map((est: any) => ({ ...est, _type: "estimate" })),
    ];

    // ═══ ANALYSIS ═══

    // 1. Build item pricing database
    const itemPricing: Record<string, {
      name: string;
      descriptions: string[];
      prices: number[];
      quantities: number[];
      categories: string[];
      appearsWithItems: string[];
      transactionCount: number;
    }> = {};

    // 2. Build transaction patterns (what items appear together)
    const transactionPatterns: Array<{
      type: string;
      docNumber: string;
      customer: string;
      total: number;
      date: string;
      items: Array<{ name: string; qty: number; price: number; desc: string }>;
      installType: string; // vertical, horizontal, insert, service, unknown
    }> = [];

    // 3. Analyze each transaction
    for (const txn of allTransactions) {
      const lineItems = (txn.Line || [])
        .filter((l: any) => l.DetailType === "SalesItemLineDetail")
        .map((l: any) => {
          const item = l.SalesItemLineDetail || {};
          return {
            name: item.ItemRef?.name || "",
            qty: item.Qty || 1,
            price: item.UnitPrice || 0,
            amount: l.Amount || 0,
            desc: l.Description || "",
          };
        })
        .filter((l: any) => l.name);

      if (lineItems.length === 0) continue;

      // Detect install type from components
      const allText = lineItems.map((l: any) => `${l.name} ${l.desc}`).join(" ").toLowerCase();
      let installType = "unknown";
      if (allText.includes("flex kit") || allText.includes("77l89") || allText.includes("horizontal") || allText.includes("dva-hc") || allText.includes("wall term")) {
        installType = "horizontal";
      } else if (allText.includes("77l71") || allText.includes("sv45l12") || allText.includes("flashing") || allText.includes("firestop") || allText.includes("h2152") || allText.includes("7dt-")) {
        installType = "vertical";
      } else if (allText.includes("flex liner") || allText.includes("insert") || allText.includes("liner kit")) {
        installType = "insert";
      } else if (allText.includes("service") || allText.includes("clean") || allText.includes("repair")) {
        installType = "service";
      }

      const itemNames = lineItems.map((l: any) => l.name);

      // Update item pricing
      for (const li of lineItems) {
        if (!itemPricing[li.name]) {
          itemPricing[li.name] = {
            name: li.name,
            descriptions: [],
            prices: [],
            quantities: [],
            categories: [],
            appearsWithItems: [],
            transactionCount: 0,
          };
        }
        const entry = itemPricing[li.name];
        entry.prices.push(li.price);
        entry.quantities.push(li.qty);
        if (li.desc && !entry.descriptions.includes(li.desc)) entry.descriptions.push(li.desc);
        entry.transactionCount++;
        // Track which items appear together
        for (const other of itemNames) {
          if (other !== li.name && !entry.appearsWithItems.includes(other)) {
            entry.appearsWithItems.push(other);
          }
        }
        if (installType !== "unknown" && !entry.categories.includes(installType)) {
          entry.categories.push(installType);
        }
      }

      transactionPatterns.push({
        type: txn._type,
        docNumber: txn.DocNumber || "",
        customer: txn.CustomerRef?.name || "",
        total: txn.TotalAmt || 0,
        date: txn.TxnDate || "",
        items: lineItems,
        installType,
      });
    }

    // 4. Build summary statistics
    const pricingSummary: Record<string, any> = {};
    for (const [name, data] of Object.entries(itemPricing)) {
      const prices = data.prices.filter((p) => p > 0);
      if (prices.length === 0) continue;
      pricingSummary[name] = {
        name: data.name,
        description: data.descriptions[0] || "",
        avgPrice: Number((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)),
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        mostRecentPrice: prices[0], // transactions sorted by date desc
        avgQty: Number((data.quantities.reduce((a, b) => a + b, 0) / data.quantities.length).toFixed(1)),
        timesUsed: data.transactionCount,
        usedIn: data.categories,
        commonlyWith: data.appearsWithItems.slice(0, 10),
      };
    }

    // 5. Build install type component maps
    const installTypeComponents: Record<string, Record<string, number>> = {
      vertical: {},
      horizontal: {},
      insert: {},
      service: {},
    };

    for (const txn of transactionPatterns) {
      if (txn.installType === "unknown") continue;
      for (const item of txn.items) {
        const map = installTypeComponents[txn.installType];
        if (map) {
          map[item.name] = (map[item.name] || 0) + 1;
        }
      }
    }

    // Sort each install type's components by frequency
    const installTypeGuide: Record<string, string[]> = {};
    for (const [type, components] of Object.entries(installTypeComponents)) {
      installTypeGuide[type] = Object.entries(components)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => `${name} (used ${count} times)`);
    }

    // 6. Store in database
    await sql`
      CREATE TABLE IF NOT EXISTS estimator_knowledge (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `;

    // Store pricing
    await sql`
      INSERT INTO estimator_knowledge (id, type, data)
      VALUES (${"pricing"}, ${"pricing"}, ${JSON.stringify(pricingSummary)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(pricingSummary)}::jsonb, updated_at = now()
    `;

    // Store install type guide
    await sql`
      INSERT INTO estimator_knowledge (id, type, data)
      VALUES (${"install-types"}, ${"install-types"}, ${JSON.stringify(installTypeGuide)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(installTypeGuide)}::jsonb, updated_at = now()
    `;

    // Store transaction patterns (sample for context)
    const samplePatterns = transactionPatterns.slice(0, 100).map((t) => ({
      type: t.type,
      docNumber: t.docNumber,
      total: t.total,
      date: t.date,
      installType: t.installType,
      itemCount: t.items.length,
      items: t.items.map((i) => `${i.name}: ${i.qty}x $${i.price}`),
    }));

    await sql`
      INSERT INTO estimator_knowledge (id, type, data)
      VALUES (${"patterns"}, ${"patterns"}, ${JSON.stringify(samplePatterns)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(samplePatterns)}::jsonb, updated_at = now()
    `;

    await sql.end();

    return NextResponse.json({
      success: true,
      analyzed: {
        invoices: invoices.length,
        estimates: estimates.length,
        totalTransactions: allTransactions.length,
        uniqueItems: Object.keys(pricingSummary).length,
        installTypes: {
          vertical: transactionPatterns.filter((t) => t.installType === "vertical").length,
          horizontal: transactionPatterns.filter((t) => t.installType === "horizontal").length,
          insert: transactionPatterns.filter((t) => t.installType === "insert").length,
          service: transactionPatterns.filter((t) => t.installType === "service").length,
          unknown: transactionPatterns.filter((t) => t.installType === "unknown").length,
        },
        topItems: Object.values(pricingSummary)
          .sort((a: any, b: any) => b.timesUsed - a.timesUsed)
          .slice(0, 10)
          .map((i: any) => `${i.name}: $${i.avgPrice} avg (${i.timesUsed} times)`),
        installTypeGuide,
      },
    });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
