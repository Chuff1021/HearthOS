import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/llama-3.1-nemotron-ultra-253b-v1";

export async function POST(request: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }

  try {
    const { prompt, customerName } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

    // Load the product catalog from the knowledge base
    let catalog: Record<string, any> = {};
    try {
      const rows = await sql`SELECT data FROM estimator_knowledge WHERE id = ${"product-catalog"}`;
      if (rows.length > 0) catalog = rows[0].data as Record<string, any>;
    } catch {}

    const products = Object.values(catalog);
    if (products.length === 0) {
      await sql.end();
      return NextResponse.json({
        lineItems: [],
        notes: "Product catalog not built yet. Run the learning system first (POST /api/estimator/learn).",
        matchCount: 0,
      });
    }

    // STEP 1: Find the matching product by searching descriptions and aliases
    const promptLower = prompt.toLowerCase().replace(/[-\/\\]/g, " ");

    // Remove install-type and measurement words — these aren't product identifiers
    const ignoreWords = new Set([
      "vertical", "horizontal", "insert", "install", "installation",
      "feet", "foot", "ft", "pipe", "with", "and", "the", "for",
      "service", "repair", "clean", "replace", "new",
    ]);
    // Remove measurement numbers (numbers followed by feet/ft/pipe) but keep model numbers
    const rawWords = promptLower.split(/\s+/).filter((w: string) => w.length >= 2 && !ignoreWords.has(w));
    const searchWords: string[] = [];
    for (let i = 0; i < rawWords.length; i++) {
      const w = rawWords[i];
      const nextWord = rawWords[i + 1] || "";
      // Skip numbers only if they're clearly measurements (followed by feet/ft/pipe or standalone large numbers like "20")
      if (/^\d+$/.test(w) && (ignoreWords.has(nextWord) || nextWord === "" || /^(feet|foot|ft|pipe|inch)/.test(nextWord))) continue;
      searchWords.push(w);
    }

    // Score each product by how many search words match
    const scored = products.map((product: any) => {
      const allText = [
        product.partNumber,
        product.modelName || "",
        product.description,
        ...(product.aliases || []),
      ].join(" ").toLowerCase().replace(/[-\/\\:]/g, " ");

      let score = 0;
      for (const word of searchWords) {
        if (allText.includes(word)) score += word.length * 2;
      }
      // Extra weight for matching the model name directly (e.g. "36 Elite")
      const modelText = (product.modelName || "").toLowerCase();
      for (const word of searchWords) {
        if (modelText.includes(word)) score += word.length * 3;
      }
      return { product, score };
    }).filter((s: any) => s.score > 0).sort((a: any, b: any) => b.score - a.score);

    if (scored.length === 0) {
      await sql.end();
      return NextResponse.json({
        lineItems: [],
        notes: `No products found matching "${prompt}". Try using the model name (e.g., "42 Apex", "36 Elite", "DRT3040").`,
        matchCount: 0,
      });
    }

    const bestMatch = scored[0].product;

    // Use consensus components (built from multiple invoices) — fall back to single template
    const baseComponents: any[] = bestMatch.consensusComponents?.length > 0
      ? bestMatch.consensusComponents
      : (bestMatch.templateEstimate || []);

    if (baseComponents.length === 0) {
      await sql.end();
      return NextResponse.json({
        lineItems: [],
        notes: `Found ${bestMatch.description} but no estimate data available yet.`,
        matchCount: scored.length,
      });
    }

    const totalTemplates: number = bestMatch.totalTemplatesAnalyzed || 1;
    const usingConsensus = bestMatch.consensusComponents?.length > 0;

    // STEP 2: Parse the user's request for pipe footage and install type
    const pipeFeetMatch = prompt.match(/(\d+)\s*(?:ft|feet|foot|')/i);
    const pipeFeet = pipeFeetMatch ? Number(pipeFeetMatch[1]) : null;
    const isHorizontal = /horizontal/i.test(prompt);
    const isVertical = /vertical/i.test(prompt);

    // STEP 3: Build the component list text for the AI
    const componentText = baseComponents.map((c: any) => {
      const pct = usingConsensus && c.appearsInPct != null ? ` [in ${c.appearsInPct}% of jobs]` : "";
      return `${c.partNumber} | ${c.description} | Qty: ${c.qty} | $${c.price}${pct}`;
    }).join("\n");

    const aiPrompt = `You are building a fireplace estimate for Aaron's Fireplace Company.

${usingConsensus
  ? `These are the STANDARD COMPONENTS that consistently appear across ${totalTemplates} past invoices for ${bestMatch.description}. Each line shows how often it appears.`
  : `This is a template from a past invoice for ${bestMatch.description}.`}

${componentText}

The customer wants: ${prompt}
${customerName ? `Customer: ${customerName}` : ""}

INSTRUCTIONS:
${pipeFeet ? `- Set pipe quantity to ${pipeFeet} feet` : "- Keep pipe quantity as shown"}
${isHorizontal ? "- HORIZONTAL install — swap vertical pipe/flashing/termination for flex kit or horizontal components" : ""}
${isVertical ? "- VERTICAL install — keep all pipe, firestop, flashing, and vertical termination" : ""}
- Add a Users Charge line item equal to 3.5% of the subtotal (all items before Users Charge)
- Only include components listed above — do not add items not shown
- Every line item must have a description

Return ONLY valid JSON — no markdown, no code fences:
{"lineItems":[{"description":"Item name","partNumber":"PART","quantity":1,"unitPrice":100,"total":100}],"notes":"short summary"}`;

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
          { role: "user", content: aiPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4096,
        stream: false,
      }),
    });

    await sql.end();

    if (!response.ok) {
      return NextResponse.json({ error: `AI error: ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Strip think tags and markdown
    const thinkClose = content.indexOf("</think>");
    if (thinkClose !== -1) content = content.substring(thinkClose + 8).trim();
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    // Parse JSON
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      try {
        const match = content.match(/\{[\s\S]*"lineItems"[\s\S]*\}/);
        if (match) result = JSON.parse(match[0]);
      } catch {}
    }

    if (!result?.lineItems?.length) {
      // Fallback: return the consensus components directly without AI
      const fallbackItems = baseComponents
        .filter((c: any) => !/users.?charge/i.test(c.partNumber || ""))
        .map((c: any) => {
          const isPipe = /\bpipe\b/i.test(c.description || c.partNumber || "") && pipeFeet;
          const qty = isPipe ? pipeFeet! : (c.qty || 1);
          const price = c.price || c.avgPrice || 0;
          return {
            description: c.description || c.partNumber,
            partNumber: c.partNumber,
            quantity: qty,
            unitPrice: price,
            total: Number((qty * price).toFixed(2)),
          };
        });
      const subtotal = fallbackItems.reduce((sum: number, c: any) => sum + c.total, 0);
      const usersCharge = Number((subtotal * 0.035).toFixed(2));
      result = {
        lineItems: [
          ...fallbackItems,
          { description: "Users Charge", partNumber: "Users Charge", quantity: 1, unitPrice: usersCharge, total: usersCharge },
        ],
        notes: `Based on ${totalTemplates} past invoice${totalTemplates !== 1 ? "s" : ""} for ${bestMatch.description}.${pipeFeet ? ` Pipe set to ${pipeFeet} ft.` : ""}`,
      };
    }

    return NextResponse.json({
      ...result,
      matchCount: scored.length,
      matchedProduct: bestMatch.description,
      matchedPartNumber: bestMatch.partNumber,
      basedOnInvoices: totalTemplates,
      usingConsensus,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Failed to generate estimate",
    }, { status: 500 });
  }
}
