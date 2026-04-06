import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/llama-3.1-nemotron-ultra-253b-v1";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "No database" }, { status: 500 });

  try {
    const { prompt, customerName } = await request.json();
    if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

    // Load all knowledge bases
    let catalog: Record<string, any> = {};
    let pricingSummary: Record<string, any> = {};
    let installTypeGuide: Record<string, string[]> = {};
    try {
      const rows = await sql`SELECT id, data FROM estimator_knowledge WHERE id IN (${"product-catalog"}, ${"pricing"}, ${"install-types"})`;
      for (const row of rows) {
        if (row.id === "product-catalog") catalog = row.data as Record<string, any>;
        if (row.id === "pricing") pricingSummary = row.data as Record<string, any>;
        if (row.id === "install-types") installTypeGuide = row.data as Record<string, string[]>;
      }
    } catch {}

    // If catalog is empty, kick off a background retrain (separate function invocation)
    // and ask the user to retry — don't block the current request waiting for QB
    if (Object.keys(pricingSummary).length === 0) {
      await sql.end();
      const origin = new URL(request.url).origin;
      // Fire-and-forget: this spawns its own Vercel function invocation
      fetch(`${origin}/api/estimator/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => {});
      return NextResponse.json(
        { error: "catalog_loading", message: "Loading your QuickBooks pricing data — please try again in 30 seconds." },
        { status: 503 }
      );
    }

    // Parse pipe footage, install type, and optional add-ons from prompt
    const pipeFeetMatch = prompt.match(/(\d+)\s*(?:ft|feet|foot|')/i);
    const pipeFeet = pipeFeetMatch ? Number(pipeFeetMatch[1]) : null;
    const isHorizontal = /horizontal/i.test(prompt);
    const isVertical = /vertical/i.test(prompt);
    const isInsert = /insert|liner/i.test(prompt);
    const isService = /\b(clean|service|inspect|repair)\b/i.test(prompt);
    const mentionsStone = /\bstone\b|\bstonework\b|\bmasonry\b|\bveneer\b/.test(prompt.toLowerCase());
    const mentionsMantel = /\bmantel\b|\bmantle\b/.test(prompt.toLowerCase());

    const installType = isHorizontal ? "horizontal"
      : isInsert ? "insert"
      : isService ? "service"
      : "vertical"; // default for gas fireplace installs

    // ── STEP 1: Try to find a matching product in the catalog ──
    const products = Object.values(catalog);

    const ignoreWords = new Set([
      "vertical", "horizontal", "insert", "install", "installation",
      "feet", "foot", "ft", "pipe", "with", "and", "the", "for",
      "service", "repair", "clean", "replace", "new", "of", "a",
    ]);

    const promptNorm = prompt.toLowerCase().replace(/[-\/\\]/g, " ");
    const rawWords = promptNorm.split(/\s+/).filter((w: string) => w.length >= 2 && !ignoreWords.has(w));
    const searchWords: string[] = [];
    for (let i = 0; i < rawWords.length; i++) {
      // Strip trailing/leading punctuation (e.g. "cover." → "cover")
      const w = rawWords[i].replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
      if (!w || w.length < 2 || ignoreWords.has(w)) continue;
      const nextWord = (rawWords[i + 1] || "").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
      // Skip standalone measurement numbers (20 feet, 15 ft, etc.)
      if (/^\d+$/.test(w) && (ignoreWords.has(nextWord) || /^(feet|foot|ft|pipe|inch)/.test(nextWord))) continue;
      searchWords.push(w);
    }

    let bestMatch: any = null;
    if (products.length > 0 && searchWords.length > 0) {
      const scored = products.map((product: any) => {
        const allText = [
          product.partNumber,
          product.modelName || "",
          product.brandName || "",
          product.description,
          ...(product.aliases || []),
        ].join(" ").toLowerCase().replace(/[-\/\\:]/g, " ");

        let score = 0;
        for (const word of searchWords) {
          if (allText.includes(word)) score += word.length * 2;
        }
        // Bonus: if modelName directly contains a search word, heavily boost it
        const modelText = (product.modelName || "").toLowerCase();
        for (const word of searchWords) {
          if (modelText.includes(word)) score += word.length * 5;
        }
        return { product, score };
      }).filter((s: any) => s.score > 0).sort((a: any, b: any) => b.score - a.score);

      if (scored.length > 0) bestMatch = scored[0].product;
    }

    // Also try searching the pricingSummary item names if catalog didn't match
    // (handles cases where the fireplace unit is named by part number in QB)
    if (!bestMatch && searchWords.length > 0) {
      const pricingItems = Object.values(pricingSummary) as any[];
      const scoredPricing = pricingItems.map((item: any) => {
        const allText = [item.name, item.description || ""].join(" ").toLowerCase().replace(/[-\/\\:]/g, " ");
        let score = 0;
        for (const word of searchWords) {
          if (allText.includes(word)) score += word.length * 2;
        }
        return { item, score };
      }).filter((s: any) => s.score > 0).sort((a: any, b: any) => b.score - a.score);

      if (scoredPricing.length > 0) {
        // Found a matching item in pricing summary — check if there's a catalog entry for that item
        const topItem = scoredPricing[0].item;
        const catalogMatch = Object.values(catalog).find((p: any) => p.partNumber === topItem.name);
        if (catalogMatch) bestMatch = catalogMatch;
      }
    }

    await sql.end();

    // ── STEP 2: Build the AI prompt ──
    let aiPrompt: string;
    let basedOnInvoices = 1;
    let matchedProductName = "";

    if (bestMatch) {
      // PATH A: Use catalog consensus components
      const baseComponents: any[] = bestMatch.consensusComponents?.length > 0
        ? bestMatch.consensusComponents
        : (bestMatch.templateEstimate || []);

      basedOnInvoices = bestMatch.totalTemplatesAnalyzed || 1;
      matchedProductName = bestMatch.description || bestMatch.partNumber;
      const usingConsensus = bestMatch.consensusComponents?.length > 0;

      const componentText = baseComponents.map((c: any) => {
        const pct = usingConsensus && c.appearsInPct != null ? ` [${c.appearsInPct}% of jobs]` : "";
        return `${c.partNumber} | ${c.description} | Qty: ${c.qty} | $${c.price}${pct}`;
      }).join("\n");

      aiPrompt = `You are building a fireplace estimate for Aaron's Fireplace Company.

${usingConsensus
  ? `Standard components from ${basedOnInvoices} past invoices for ${matchedProductName}:`
  : `Template from a past invoice for ${matchedProductName}:`}

${componentText}

Customer request: ${prompt}
${customerName ? `Customer: ${customerName}` : ""}

Instructions:
${pipeFeet ? `- Set pipe quantity to ${pipeFeet} feet` : "- Keep pipe quantity as shown"}
${isHorizontal ? "- HORIZONTAL install: use flex kit/horizontal components, not vertical pipe" : ""}
${isVertical ? "- VERTICAL install: keep straight pipe, firestop, flashing, vertical cap" : ""}
- Add a Users Charge line = 3.5% of subtotal (all items before it)
- Only include components listed above — do not invent new items
${!mentionsStone ? "- EXCLUDE any stone/masonry/veneer items" : ""}
${!mentionsMantel ? "- EXCLUDE any mantel items" : ""}
- Every line item must have a description

Return ONLY valid JSON, no markdown:
{"lineItems":[{"description":"...","partNumber":"...","quantity":1,"unitPrice":100,"total":100}],"notes":"..."}`;

    } else {
      // PATH B: No catalog match — build from install type guide + real pricing data
      matchedProductName = `${installType} install`;

      const guideItems: string[] = installTypeGuide[installType] || installTypeGuide["vertical"] || [];

      const componentLines = guideItems.slice(0, 25).map((entry: string) => {
        const name = entry.replace(/ \(used \d+ times\)$/, "");
        const p = pricingSummary[name];
        if (!p) return `${name} | price: unknown`;
        const price = p.mostRecentPrice || p.avgPrice;
        return `${name} | $${price} each | avg qty: ${p.avgQty} | used ${p.timesUsed} times`;
      }).filter(Boolean).join("\n");

      // Also look for any item in pricingSummary that matches any search word
      const relevantItems = Object.values(pricingSummary as Record<string, any>)
        .filter((item: any) => {
          const text = (item.name || "").toLowerCase().replace(/[-\/\\:]/g, " ");
          return searchWords.some((w: string) => text.includes(w));
        })
        .sort((a: any, b: any) => b.timesUsed - a.timesUsed)
        .slice(0, 10)
        .map((item: any) => `${item.name} | $${item.mostRecentPrice || item.avgPrice} each | used ${item.timesUsed} times`)
        .join("\n");

      basedOnInvoices = guideItems.length;

      // If search words matched nothing, use most-used items from QB as fallback context
      const contextItems = relevantItems || Object.values(pricingSummary as Record<string, any>)
        .sort((a: any, b: any) => b.timesUsed - a.timesUsed)
        .slice(0, 15)
        .map((item: any) => `${item.name} | $${item.mostRecentPrice || item.avgPrice} each | used ${item.timesUsed} times`)
        .join("\n");

      aiPrompt = `You are building a fireplace estimate for Aaron's Fireplace Company.

Customer request: ${prompt}
${customerName ? `Customer: ${customerName}` : ""}

${contextItems ? `Products matching this request (use these as the main unit):\n${contextItems}\n` : ""}
Common ${installType} install components with real prices from past jobs:
${componentLines}

CRITICAL RULES:
- ONLY use part numbers EXACTLY as they appear in the lists above — do NOT invent codes like "EV-36" or "VP-1"
- Use the part number column value as the partNumber field in JSON
${pipeFeet ? `- Set pipe quantity to ${pipeFeet} feet` : "- Use typical pipe quantity for this install type"}
${isHorizontal ? "- HORIZONTAL install: use flex kit/wall termination, not vertical straight pipe" : ""}
${isVertical ? "- VERTICAL install: use straight pipe sections, firestop, flashing, vertical cap" : ""}
- Add a Users Charge line = 3.5% of subtotal (all items before it)
- Only include components that make sense for this specific job
${!mentionsStone ? "- Do NOT include stone/masonry/veneer" : ""}
${!mentionsMantel ? "- Do NOT include mantel items" : ""}
- Every line item must have a description

Return ONLY valid JSON, no markdown:
{"lineItems":[{"description":"...","partNumber":"...","quantity":1,"unitPrice":100,"total":100}],"notes":"..."}`;
    }

    // ── STEP 3: Call the AI ──
    const response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "detailed thinking off" },
          { role: "user", content: aiPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4096,
        stream: false,
      }),
    });

    if (!response.ok) return NextResponse.json({ error: `AI error: ${response.status}` }, { status: 502 });

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    const thinkClose = content.indexOf("</think>");
    if (thinkClose !== -1) content = content.substring(thinkClose + 8).trim();
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let result: any;
    try {
      result = JSON.parse(content);
    } catch {
      try {
        const match = content.match(/\{[\s\S]*"lineItems"[\s\S]*\}/);
        if (match) result = JSON.parse(match[0]);
      } catch {}
    }

    // Fallback: return base components directly if AI parse failed
    if (!result?.lineItems?.length) {
      if (bestMatch) {
        const base: any[] = bestMatch.consensusComponents?.length > 0
          ? bestMatch.consensusComponents : (bestMatch.templateEstimate || []);
        const fallbackItems = base
          .filter((c: any) => !/users.?charge/i.test(c.partNumber || ""))
          .map((c: any) => {
            const isPipe = /\bpipe\b/i.test(c.description || c.partNumber || "") && pipeFeet;
            const qty = isPipe ? pipeFeet! : (c.qty || 1);
            const price = c.price || c.avgPrice || 0;
            return { description: c.description || c.partNumber, partNumber: c.partNumber, quantity: qty, unitPrice: price, total: Number((qty * price).toFixed(2)) };
          });
        const subtotal = fallbackItems.reduce((s: number, c: any) => s + c.total, 0);
        result = {
          lineItems: [...fallbackItems, { description: "Users Charge", partNumber: "Users Charge", quantity: 1, unitPrice: Number((subtotal * 0.035).toFixed(2)), total: Number((subtotal * 0.035).toFixed(2)) }],
          notes: `Based on ${basedOnInvoices} past invoice${basedOnInvoices !== 1 ? "s" : ""} for ${matchedProductName}.`,
        };
      } else {
        return NextResponse.json({ error: "Could not build estimate. Try retraining the AI (Retrain AI button) or be more specific with the model name." }, { status: 422 });
      }
    }

    return NextResponse.json({
      ...result,
      matchedProduct: matchedProductName,
      basedOnInvoices,
      usingConsensus: Boolean(bestMatch?.consensusComponents?.length),
      catalogMatch: Boolean(bestMatch),
    });

  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate estimate" }, { status: 500 });
  }
}
