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
    const searchWords = promptLower.split(/\s+/)
      .filter((w: string) => w.length >= 2 && !ignoreWords.has(w))
      // Also ignore pure numbers that look like measurements (10, 20, 30)
      .filter((w: string) => !/^\d{1,2}$/.test(w));

    // Score each product by how many search words match
    const scored = products.map((product: any) => {
      const allText = [
        product.partNumber,
        product.description,
        ...(product.aliases || []),
      ].join(" ").toLowerCase().replace(/[-\/\\]/g, " ");

      let score = 0;
      for (const word of searchWords) {
        if (allText.includes(word)) score += word.length * 2; // weight by word length
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
    const templateEstimate = bestMatch.templateEstimate || [];

    if (templateEstimate.length === 0) {
      await sql.end();
      return NextResponse.json({
        lineItems: [],
        notes: `Found ${bestMatch.description} but no template estimate available.`,
        matchCount: scored.length,
      });
    }

    // STEP 2: Parse the user's request for pipe footage and install type
    const pipeFeetMatch = prompt.match(/(\d+)\s*(?:ft|feet|foot|')/i);
    const pipeFeet = pipeFeetMatch ? Number(pipeFeetMatch[1]) : null;
    const isHorizontal = /horizontal/i.test(prompt);
    const isVertical = /vertical/i.test(prompt);

    // STEP 3: Send the template estimate to the AI to adjust based on the prompt
    const templateText = templateEstimate.map((c: any) =>
      `${c.partNumber} | ${c.description} | Qty: ${c.qty} | $${c.price} | Total: $${c.amount}`
    ).join("\n");

    const aiPrompt = `You are adjusting a fireplace estimate for Aaron's Fireplace Company.

Here is a TEMPLATE ESTIMATE from a past job for the same product (${bestMatch.description}):

${templateText}

The customer wants: ${prompt}
${customerName ? `Customer: ${customerName}` : ""}

ADJUSTMENTS NEEDED:
${pipeFeet ? `- Change pipe quantity to ${pipeFeet} feet (find the per-foot pipe item and set qty to ${pipeFeet})` : "- Keep pipe quantity as-is"}
${isHorizontal ? "- This is a HORIZONTAL install — replace vertical pipe/flashing/termination with a flex kit or horizontal components if you see them in the pricing database" : ""}
${isVertical ? "- This is a VERTICAL install — keep all pipe, firestop, flashing, and vertical termination" : ""}
- Recalculate Users Charge as 3.5% of the new subtotal (before Users Charge)
- Keep all other components and prices the same
- Every line item MUST have a description

Return ONLY valid JSON — no markdown, no code fences:
{"lineItems":[{"description":"Item name","partNumber":"PART","quantity":1,"unitPrice":100,"total":100}],"notes":"Based on past estimate for ${bestMatch.description}"}`;

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
      // Fallback: just return the template estimate directly
      const subtotal = templateEstimate
        .filter((c: any) => !c.partNumber?.includes("Users Charge"))
        .reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
      const usersCharge = Number((subtotal * 0.035).toFixed(2));

      result = {
        lineItems: templateEstimate
          .filter((c: any) => !c.partNumber?.includes("Users Charge"))
          .map((c: any) => {
            // Adjust pipe qty if specified
            const isPipe = c.qty > 5 && pipeFeet;
            return {
              description: c.description || c.partNumber,
              partNumber: c.partNumber,
              quantity: isPipe ? pipeFeet : c.qty,
              unitPrice: c.price,
              total: isPipe ? pipeFeet * c.price : c.amount,
            };
          })
          .concat([{
            description: "Users Charge",
            partNumber: "Users Charge",
            quantity: 1,
            unitPrice: usersCharge,
            total: usersCharge,
          }]),
        notes: `Based on past estimate for ${bestMatch.description}. ${pipeFeet ? `Pipe adjusted to ${pipeFeet} feet.` : ""}`,
      };
    }

    return NextResponse.json({
      ...result,
      matchCount: scored.length,
      matchedProduct: bestMatch.description,
      matchedPartNumber: bestMatch.partNumber,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Failed to generate estimate",
    }, { status: 500 });
  }
}
