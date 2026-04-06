import postgres from "postgres";

/**
 * Builds the estimator knowledge base from QuickBooks invoices and estimates.
 * Called by both the /learn route and auto-triggered from /ai-generate when
 * the catalog is empty.
 */
export async function buildEstimatorCatalog(
  sql: postgres.Sql,
  qbClient: any,
): Promise<{
  productCatalog: Record<string, any>;
  pricingSummary: Record<string, any>;
  installTypeGuide: Record<string, string[]>;
  invoiceCount: number;
  estimateCount: number;
}> {
  // Fetch last 12 months of invoices
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let invoices: any[] = [];
  try {
    invoices = await qbClient.queryAll(`SELECT * FROM Invoice WHERE TxnDate >= '${cutoffStr}' ORDERBY TxnDate DESC`);
  } catch {
    try {
      invoices = await qbClient.queryAll("SELECT * FROM Invoice ORDERBY TxnDate DESC");
    } catch {
      invoices = await qbClient.getInvoices();
    }
  }

  let estimates: any[] = [];
  try {
    estimates = await qbClient.queryAll(`SELECT * FROM Estimate WHERE TxnDate >= '${cutoffStr}' ORDERBY TxnDate DESC`);
  } catch {
    try {
      estimates = await qbClient.queryAll("SELECT * FROM Estimate ORDERBY TxnDate DESC");
    } catch {
      try { estimates = await qbClient.getEstimates(); } catch {}
    }
  }

  const allTransactions = [
    ...invoices.map((inv: any) => ({ ...inv, _type: "invoice" })),
    ...estimates.map((est: any) => ({ ...est, _type: "estimate" })),
  ];

  // ── 1. Build item pricing database ──
  const itemPricing: Record<string, {
    name: string;
    descriptions: string[];
    prices: number[];
    quantities: number[];
    categories: string[];
    appearsWithItems: string[];
    transactionCount: number;
  }> = {};

  const transactionPatterns: Array<{
    type: string;
    docNumber: string;
    customer: string;
    total: number;
    date: string;
    items: Array<{ name: string; qty: number; price: number; desc: string }>;
    installType: string;
  }> = [];

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
    for (const li of lineItems) {
      if (!itemPricing[li.name]) {
        itemPricing[li.name] = { name: li.name, descriptions: [], prices: [], quantities: [], categories: [], appearsWithItems: [], transactionCount: 0 };
      }
      const entry = itemPricing[li.name];
      entry.prices.push(li.price);
      entry.quantities.push(li.qty);
      if (li.desc && !entry.descriptions.includes(li.desc)) entry.descriptions.push(li.desc);
      entry.transactionCount++;
      for (const other of itemNames) {
        if (other !== li.name && !entry.appearsWithItems.includes(other)) entry.appearsWithItems.push(other);
      }
      if (installType !== "unknown" && !entry.categories.includes(installType)) entry.categories.push(installType);
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

  // ── 2. Build pricing summary ──
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
      mostRecentPrice: prices[0],
      avgQty: Number((data.quantities.reduce((a, b) => a + b, 0) / data.quantities.length).toFixed(1)),
      timesUsed: data.transactionCount,
      usedIn: data.categories,
      commonlyWith: data.appearsWithItems.slice(0, 10),
    };
  }

  // ── 3. Build install type guide ──
  const installTypeComponents: Record<string, Record<string, number>> = { vertical: {}, horizontal: {}, insert: {}, service: {} };
  for (const txn of transactionPatterns) {
    if (txn.installType === "unknown") continue;
    for (const item of txn.items) {
      const map = installTypeComponents[txn.installType];
      if (map) map[item.name] = (map[item.name] || 0) + 1;
    }
  }
  const installTypeGuide: Record<string, string[]> = {};
  for (const [type, components] of Object.entries(installTypeComponents)) {
    installTypeGuide[type] = Object.entries(components)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => `${name} (used ${count} times)`);
  }

  // ── 4. Build product catalog with consensus components ──
  const productMap: Record<string, any> = {};
  const rawTransactions = [
    ...invoices.map((inv: any) => ({ ...inv, _source: "invoice" })),
    ...estimates.map((est: any) => ({ ...est, _source: "estimate" })),
  ];

  for (const txn of rawTransactions) {
    const lines = (txn.Line || []).filter((l: any) => l.DetailType === "SalesItemLineDetail");
    if (lines.length === 0) continue;

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
      productMap[pn] = { partNumber: pn, descriptions: [], invoicePrices: [], estimatePrices: [], invoiceTemplates: [], estimateTemplates: [] };
    }
    const entry = productMap[pn];
    if (mainUnit.desc && !entry.descriptions.includes(mainUnit.desc)) entry.descriptions.push(mainUnit.desc);

    const components = lines.map((l: any) => {
      const item = l.SalesItemLineDetail || {};
      return { partNumber: item.ItemRef?.name || "", description: l.Description || item.ItemRef?.name || "", qty: item.Qty || 1, price: item.UnitPrice || 0, amount: l.Amount || 0 };
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
    const templates: any[] = p.invoiceTemplates.length > 0 ? p.invoiceTemplates : p.estimateTemplates;
    if (prices.length === 0 || templates.length === 0) continue;

    const componentTally: Record<string, { description: string; prices: number[]; qtys: number[]; appearances: number }> = {};
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
        if ((comp.description || "").length > componentTally[key].description.length) {
          componentTally[key].description = comp.description;
        }
      }
    }

    const totalTemplates = templates.length;
    const minAppearances = totalTemplates === 1 ? 1 : Math.max(2, Math.ceil(totalTemplates * 0.4));
    const consensusComponents = Object.entries(componentTally)
      .filter(([, data]) => data.appearances >= minAppearances)
      .map(([partNumber, data]) => {
        const avgPrice = data.prices.length > 0 ? Number((data.prices.reduce((a, b) => a + b, 0) / data.prices.length).toFixed(2)) : 0;
        const mostRecentPrice = data.prices[0] ?? 0;
        const avgQty = data.qtys.length > 0 ? Number((data.qtys.reduce((a, b) => a + b, 0) / data.qtys.length).toFixed(1)) : 1;
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
      templateEstimate: templates[0]?.components || [],
    };
  }

  // ── 5. Persist to DB ──
  await sql`
    CREATE TABLE IF NOT EXISTS estimator_knowledge (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`INSERT INTO estimator_knowledge (id, type, data)
    VALUES (${"pricing"}, ${"pricing"}, ${JSON.stringify(pricingSummary)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(pricingSummary)}::jsonb, updated_at = now()`;

  await sql`INSERT INTO estimator_knowledge (id, type, data)
    VALUES (${"install-types"}, ${"install-types"}, ${JSON.stringify(installTypeGuide)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(installTypeGuide)}::jsonb, updated_at = now()`;

  const samplePatterns = transactionPatterns.slice(0, 100).map((t) => ({
    type: t.type, docNumber: t.docNumber, total: t.total, date: t.date,
    installType: t.installType, itemCount: t.items.length,
    items: t.items.map((i) => `${i.name}: ${i.qty}x $${i.price}`),
  }));
  await sql`INSERT INTO estimator_knowledge (id, type, data)
    VALUES (${"patterns"}, ${"patterns"}, ${JSON.stringify(samplePatterns)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(samplePatterns)}::jsonb, updated_at = now()`;

  await sql`INSERT INTO estimator_knowledge (id, type, data)
    VALUES (${"product-catalog"}, ${"product-catalog"}, ${JSON.stringify(productCatalog)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(productCatalog)}::jsonb, updated_at = now()`;

  return { productCatalog, pricingSummary, installTypeGuide, invoiceCount: invoices.length, estimateCount: estimates.length };
}
