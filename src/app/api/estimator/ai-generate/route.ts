import { NextRequest, NextResponse } from "next/server";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/llama-3.1-nemotron-ultra-253b-v1";

const SYSTEM_PROMPT = `You are an estimate generator for Aaron's Fireplace, a fireplace installation and service company.

When given a description of work needed, you generate a detailed estimate with line items, quantities, and prices based on the company's historical pricing data provided below.

RULES:
1. Generate line items as a JSON array. Each item has: description, quantity, unitPrice, total
2. Use ONLY prices from past estimates for this specific model. NEVER make up prices.
3. If no matching estimates are found, return: { "lineItems": [], "notes": "No pricing history found for this model. Please build the estimate manually." }
4. For fireplace installations, include ALL required components based on what was included in past estimates for this model:
   - The fireplace unit itself
   - Vent pipe (correct type and quantity based on the run described)
   - Elbows if the run requires direction changes
   - Termination cap
   - Firestop/support box if going through ceiling/floor
   - Flashing if going through roof
   - Gas line components if gas unit
   - Any frame/surround if specified
   - Installation labor
4. For service calls, include:
   - Service/inspection fee
   - Any replacement parts mentioned
   - Labor if separate from service fee
5. Match part numbers from historical data when possible
6. Include "Users Charge" (tax/fees) as a percentage of the subtotal — typically around 3-4%
7. If you're not sure about a specific price, use the closest match from history and note it

RESPOND WITH ONLY a JSON object in this exact format:
{
  "lineItems": [
    { "description": "Item description", "partNumber": "optional", "quantity": 1, "unitPrice": 100.00, "total": 100.00 }
  ],
  "notes": "Any notes about the estimate"
}

Do not include any text before or after the JSON.`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });
  }

  try {
    const { prompt, customerName } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    // Fetch QB estimates — prioritize ones matching this model/product
    let historicalData = "";
    try {
      const qbRes = await fetch(`${request.nextUrl.origin}/api/quickbooks/estimates`, {
        headers: { cookie: request.headers.get("cookie") || "" },
        cache: "no-store",
      });
      if (qbRes.ok) {
        const qbData = await qbRes.json();
        const allEstimates = qbData.estimates || [];

        // Extract keywords from the prompt — smart matching for model numbers
        const promptLower = prompt.toLowerCase().replace(/[-\/\\]/g, " ");
        const words = promptLower.split(/\s+/).filter((w: string) => w.length >= 2);

        // Build search variants: "DRT3040" → ["drt3040", "drt 3040", "drt-3040", "3040"]
        // Also extract model number patterns (letters+digits combos)
        const modelPatterns: string[] = [];
        for (const w of words) {
          modelPatterns.push(w);
          // Split letters from numbers: "drt3040" → "drt" + "3040"
          const parts = w.match(/[a-z]+|[0-9]+/g);
          if (parts && parts.length > 1) {
            modelPatterns.push(parts.join(" ")); // "drt 3040"
            modelPatterns.push(parts.join("-")); // "drt-3040"
            modelPatterns.push(parts.join("")); // "drt3040"
            // Just the number part often appears in part numbers
            for (const p of parts) {
              if (/\d{3,}/.test(p)) modelPatterns.push(p); // "3040"
            }
          }
        }
        // Also add longer keywords (brand names, model names)
        const searchTerms = [...new Set([...modelPatterns, ...words.filter((w: string) => w.length >= 4)])];

        // Find estimates that match — check the full JSON text for any search term
        const matchingEstimates = allEstimates.filter((est: any) => {
          const estText = JSON.stringify(est).toLowerCase().replace(/[-\/\\]/g, " ");
          return searchTerms.some((term: string) => estText.includes(term));
        });

        // ONLY use estimates that match this specific model
        const estimates = matchingEstimates.slice(0, 30);

        // Build a pricing reference from historical estimates
        const itemPrices = new Map<string, { prices: number[]; descriptions: string[] }>();
        const laborPrices: { type: string; amount: number; context: string }[] = [];

        for (const est of estimates) {
          const customerCtx = est.CustomerRef?.name || "";
          for (const line of (est.Line || []).filter((l: any) => l.DetailType === "SalesItemLineDetail")) {
            const item = line.SalesItemLineDetail;
            const name = item?.ItemRef?.name || "";
            const price = item?.UnitPrice || 0;
            const desc = line.Description || name;

            if (name.toLowerCase().includes("install") || name.toLowerCase().includes("labor") || name.toLowerCase().includes("service")) {
              laborPrices.push({ type: name, amount: price, context: `${customerCtx} - $${est.TotalAmt}` });
            }

            if (name && price > 0) {
              const existing = itemPrices.get(name) || { prices: [], descriptions: [] };
              existing.prices.push(price);
              if (desc && !existing.descriptions.includes(desc)) existing.descriptions.push(desc);
              itemPrices.set(name, existing);
            }
          }
        }

        // Build pricing summary
        const pricingLines: string[] = [];
        pricingLines.push("=== ITEM PRICING FROM PAST ESTIMATES ===");
        for (const [name, data] of Array.from(itemPrices.entries()).slice(0, 100)) {
          const avg = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
          pricingLines.push(`${name}: $${avg.toFixed(2)} (${data.descriptions[0] || ""})`);
        }

        pricingLines.push("\n=== LABOR RATES FROM PAST ESTIMATES ===");
        for (const labor of laborPrices.slice(0, 20)) {
          pricingLines.push(`${labor.type}: $${labor.amount} (${labor.context})`);
        }

        if (matchingEstimates.length > 0) {
          pricingLines.push(`\n=== PAST ESTIMATES FOR THIS MODEL (${matchingEstimates.length} found) ===`);
          pricingLines.push("Use ONLY these estimates for pricing. Match the exact components and pricing from past jobs.");
        } else {
          pricingLines.push(`\n=== NO PAST ESTIMATES FOUND FOR THIS MODEL ===`);
          pricingLines.push("No matching estimates found. Tell the user you don't have pricing history for this model and they should build the estimate manually.");
        }

        for (const est of estimates.slice(0, 15)) {
          const lines = (est.Line || [])
            .filter((l: any) => l.DetailType === "SalesItemLineDetail")
            .map((l: any) => `  ${l.SalesItemLineDetail?.ItemRef?.name}: ${l.SalesItemLineDetail?.Qty || 1}x $${l.SalesItemLineDetail?.UnitPrice} = $${l.Amount}`);
          if (lines.length > 0) {
            pricingLines.push(`\nEstimate #${est.DocNumber} for ${est.CustomerRef?.name} — Total: $${est.TotalAmt}`);
            pricingLines.push(lines.join("\n"));
          }
        }

        historicalData = pricingLines.join("\n");
      }
    } catch (e) {
      console.warn("[AI-ESTIMATE] Failed to load QB data:", e);
    }

    // Call Nemotron
    const response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "detailed thinking off" },
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `${historicalData}\n\n=== GENERATE ESTIMATE FOR ===\nCustomer: ${customerName || "N/A"}\nWork needed: ${prompt}\n\nGenerate the estimate JSON:`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `AI error: ${response.status}`, details: err }, { status: 502 });
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Strip <think> tags
    const thinkClose = content.indexOf("</think>");
    if (thinkClose !== -1) content = content.substring(thinkClose + 8).trim();
    if (!content) content = (data.choices?.[0]?.message?.content || "").replace(/<\/?think>/g, "").trim();

    // Extract JSON from the response
    let result;
    try {
      // Try to find JSON in the response
      const jsonMatch = content.match(/\{[\s\S]*"lineItems"[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(content);
      }
    } catch {
      return NextResponse.json({
        error: "Could not parse AI response",
        raw: content.slice(0, 500),
      }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Failed to generate estimate",
    }, { status: 500 });
  }
}
