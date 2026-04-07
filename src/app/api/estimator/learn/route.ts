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
    // Skip if pricing already has sku data (means QB Items were fetched)
    try {
      const existing = await sql`SELECT data FROM estimator_knowledge WHERE id = ${"pricing"} LIMIT 1`;
      if (existing.length > 0) {
        const items = Object.values(existing[0].data as Record<string, any>);
        if (items.length > 0 && "sku" in (items[0] as any)) {
          await sql.end();
          return NextResponse.json({ success: true, skipped: true, message: "Catalog already built with SKUs" });
        }
      }
    } catch {}

    // Get QB client
    const org = await getOrCreateDefaultOrg();
    if (!org.qbAccessToken || !org.qbRefreshToken || !org.qbRealmId) {
      await sql.end();
      return NextResponse.json({ error: "QuickBooks not connected" }, { status: 401 });
    }
    const client = getClientFromTokens(org.qbAccessToken, org.qbRefreshToken, org.qbRealmId);

    // Fetch ALL invoices from 2025-2026
    let invoices: any[] = [];
    try {
      invoices = await (client as any).queryAll("SELECT * FROM Invoice WHERE TxnDate >= '2025-01-01' ORDERBY TxnDate DESC");
    } catch {
      try {
        invoices = await (client as any).queryAll("SELECT * FROM Invoice ORDERBY TxnDate DESC");
      } catch {
        invoices = await client.getInvoices();
      }
    }

    // Fetch ALL estimates from 2025-2026
    let estimates: any[] = [];
    try {
      estimates = await (client as any).queryAll("SELECT * FROM Estimate WHERE TxnDate >= '2025-01-01' ORDERBY TxnDate DESC");
    } catch {
      try {
        estimates = await (client as any).queryAll("SELECT * FROM Estimate ORDERBY TxnDate DESC");
      } catch {
        estimates = await (client as any).getEstimates();
      }
    }

    // Fetch QB Items to get real SKU/part numbers
    const itemSkuMap: Record<string, string> = {};
    const itemFullNameMap: Record<string, string> = {};
    try {
      const qbItems = await (client as any).queryAll("SELECT * FROM Item WHERE Active = true");
      for (const item of qbItems) {
        const name = item.Name || "";
        if (name) {
          itemSkuMap[name] = item.Sku || "";
          itemFullNameMap[name] = item.FullyQualifiedName || name;
        }
      }
    } catch {}

    // Combine — invoices first (primary truth), then estimates
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
        sku: itemSkuMap[name] || "",
        fullName: itemFullNameMap[name] || name,
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

    // 7. Build PRODUCT CATALOG from RAW QB data (not analyzed patterns)
    const productMap: Record<string, any> = {};

    // Process raw invoices and estimates directly
    const rawTransactions = [
      ...invoices.map((inv: any) => ({ ...inv, _source: "invoice" })),
      ...estimates.map((est: any) => ({ ...est, _source: "estimate" })),
    ];

    for (const txn of rawTransactions) {
      const lines = (txn.Line || []).filter((l: any) => l.DetailType === "SalesItemLineDetail");
      if (lines.length === 0) continue;

      // Find the main unit (most expensive non-labor/pipe item)
      let mainUnit: any = null;
      let maxAmount = 0;
      for (const l of lines) {
        const item = l.SalesItemLineDetail || {};
        const name = (item.ItemRef?.name || "").toLowerCase();
        const amount = l.Amount || 0;
        if (name.includes("service") || name.includes("install") || name.includes("labor")) continue;
        if (name.includes("users charge") || name.includes("charge") || name.includes("sales tax")) continue;
        if (name.includes("pipe") || name.includes("chase cover") || name.includes("stone") || name.includes("mantels") || name.includes("materials")) continue;
        if (amount > maxAmount) {
          maxAmount = amount;
          mainUnit = { name: item.ItemRef?.name || "", desc: l.Description || "", price: item.UnitPrice || 0 };
        }
      }
      if (!mainUnit || maxAmount < 100) continue;

      const pn = mainUnit.name;
      if (!productMap[pn]) {
        // Extract model name from QB category path: "Gas Fireplaces:Heat & Glo:36 Elite" → "36 Elite"
        const segments = pn.split(":").map((s: string) => s.trim()).filter(Boolean);
        const modelName = segments[segments.length - 1] || pn;
        productMap[pn] = { partNumber: pn, modelName, descriptions: modelName !== pn ? [modelName] : [], invoicePrices: [], estimatePrices: [], invoiceTemplates: [], estimateTemplates: [] };
      }
      const entry = productMap[pn];
      if (mainUnit.desc && !entry.descriptions.includes(mainUnit.desc)) entry.descriptions.push(mainUnit.desc);

      const components = lines.map((l: any) => {
        const item = l.SalesItemLineDetail || {};
        return {
          partNumber: item.ItemRef?.name || "",
          description: l.Description || item.ItemRef?.name || "",
          qty: item.Qty || 1,
          price: item.UnitPrice || 0,
          amount: l.Amount || 0,
        };
      });
      const template = { docNumber: txn.DocNumber, customer: txn.CustomerRef?.name || "", total: txn.TotalAmt, date: txn.TxnDate, components };

      if (txn._source === "invoice") {
        entry.invoicePrices.push(mainUnit.price);
        entry.invoiceTemplates.push(template);
      } else {
        entry.estimatePrices.push(mainUnit.price);
        entry.estimateTemplates.push(template);
      }
    }

    const productCatalog: Record<string, any> = {};
    for (const p of Object.values(productMap) as any[]) {
      const prices = p.invoicePrices.length > 0 ? p.invoicePrices : p.estimatePrices;
      // Prefer invoices; fall back to estimates
      const templates: any[] = p.invoiceTemplates.length > 0 ? p.invoiceTemplates : p.estimateTemplates;
      if (prices.length === 0 || templates.length === 0) continue;

      // Build consensus: tally every component across ALL templates for this product
      const componentTally: Record<string, {
        description: string;
        prices: number[];
        qtys: number[];
        appearances: number;
      }> = {};

      for (const tmpl of templates) {
        for (const comp of (tmpl.components || [])) {
          const key = comp.partNumber || comp.description || "";
          if (!key) continue;
          if (!componentTally[key]) {
            componentTally[key] = { description: comp.description || comp.partNumber || "", prices: [], qtys: [], appearances: 0 };
          }
          componentTally[key].appearances++;
          if (comp.price > 0) componentTally[key].prices.push(comp.price);
          if (comp.qty > 0) componentTally[key].qtys.push(comp.qty);
          // Prefer the most descriptive description
          if ((comp.description || "").length > componentTally[key].description.length) {
            componentTally[key].description = comp.description;
          }
        }
      }

      const totalTemplates = templates.length;
      // Keep components that appear in at least 2 jobs OR at least 50% of jobs
      const minAppearances = totalTemplates === 1 ? 1 : Math.max(2, Math.ceil(totalTemplates * 0.4));

      const consensusComponents = Object.entries(componentTally)
        .filter(([, data]) => data.appearances >= minAppearances)
        .map(([partNumber, data]) => {
          const avgPrice = data.prices.length > 0
            ? Number((data.prices.reduce((a, b) => a + b, 0) / data.prices.length).toFixed(2))
            : 0;
          const mostRecentPrice = data.prices[0] ?? 0;
          const avgQty = data.qtys.length > 0
            ? Number((data.qtys.reduce((a, b) => a + b, 0) / data.qtys.length).toFixed(1))
            : 1;
          return {
            partNumber,
            description: data.description,
            qty: avgQty,
            price: mostRecentPrice || avgPrice,
            avgPrice,
            amount: Number(((mostRecentPrice || avgPrice) * avgQty).toFixed(2)),
            appearsIn: data.appearances,
            appearsInPct: Math.round((data.appearances / totalTemplates) * 100),
          };
        })
        .sort((a, b) => b.appearsIn - a.appearsIn);

      productCatalog[p.partNumber] = {
        partNumber: p.partNumber,
        modelName: p.modelName || p.partNumber,
        description: p.descriptions[0] || "",
        aliases: p.descriptions,
        avgPrice: Number((prices.reduce((a: number, b: number) => a + b, 0) / prices.length).toFixed(2)),
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        invoiceCount: p.invoiceTemplates.length,
        estimateCount: p.estimateTemplates.length,
        priceSource: p.invoicePrices.length > 0 ? "invoice" : "estimate",
        consensusComponents,
        totalTemplatesAnalyzed: totalTemplates,
        // Keep single template as fallback for products with only 1 invoice
        templateEstimate: templates[0]?.components || [],
      };
    }

    await sql`
      INSERT INTO estimator_knowledge (id, type, data)
      VALUES (${"product-catalog"}, ${"product-catalog"}, ${JSON.stringify(productCatalog)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(productCatalog)}::jsonb, updated_at = now()
    `;

    await sql.end();

    return NextResponse.json({
      success: true,
      analyzed: {
        productsCataloged: Object.keys(productCatalog).length,
        productsFromInvoices: Object.values(productCatalog).filter((p: any) => p.priceSource === "invoice").length,
        productsFromEstimates: Object.values(productCatalog).filter((p: any) => p.priceSource === "estimate").length,
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
