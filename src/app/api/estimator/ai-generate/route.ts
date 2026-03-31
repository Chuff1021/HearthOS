import { NextRequest, NextResponse } from "next/server";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/llama-3.1-nemotron-ultra-253b-v1";

const SYSTEM_PROMPT = `You are an estimate generator for Aaron's Fireplace, a fireplace installation and service company.

You will receive REAL past estimates from the company's QuickBooks. These contain actual part numbers, descriptions, quantities, and prices the company has charged.

YOUR JOB: Look at the matching past estimates and build a new estimate using the SAME part numbers and pricing. Adjust quantities based on what the customer needs (e.g., if they need 20 feet of pipe, calculate the right number of pipe sections).

RULES:
1. Use the EXACT part numbers and item names from the past estimates
2. Use the ACTUAL prices from past estimates — if a part was priced differently across estimates, use the most recent price
3. Include every component needed: fireplace unit, face/facade, pipe sections, elbows if needed, termination cap, firestop, flashing, collars, install labor, Users Charge
4. For pipe: ALWAYS quote using the 1-foot section (77L71 / SV45L12). If the customer needs 20 feet, put quantity 20 at the per-foot price. Do NOT use the 36" (77L73) or 48" (77L74) pipe sections for estimates — those are for invoicing later. The estimate always uses the per-foot rate x number of feet.
5. Users Charge is typically 3.5% of the subtotal
6. If no matching past estimates are found, say so — do NOT make up part numbers or prices

RESPOND WITH ONLY a JSON object:
{
  "lineItems": [
    { "description": "Part description from QB", "partNumber": "F4999", "quantity": 1, "unitPrice": 1500.00, "total": 1500.00 }
  ],
  "notes": "Based on estimate #XXXX for [customer]. Adjusted pipe to XX feet."
}`;

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

    // Fetch ALL QB estimates and search for matching ones
    let matchingEstimateText = "";
    let matchCount = 0;

    try {
      const qbRes = await fetch(`${request.nextUrl.origin}/api/quickbooks/estimates`, {
        headers: { cookie: request.headers.get("cookie") || "" },
        cache: "no-store",
      });

      if (qbRes.ok) {
        const qbData = await qbRes.json();
        const allEstimates = qbData.estimates || [];

        // Build search terms from the prompt
        const promptLower = prompt.toLowerCase().replace(/[-\/\\]/g, " ");
        const words = promptLower.split(/\s+/).filter((w: string) => w.length >= 2);

        // Generate fuzzy search variants
        const searchTerms: string[] = [];
        for (const w of words) {
          searchTerms.push(w);
          const parts = w.match(/[a-z]+|[0-9]+/g);
          if (parts && parts.length > 1) {
            searchTerms.push(parts.join(" "));
            searchTerms.push(parts.join(""));
            for (const p of parts) {
              if (/\d{3,}/.test(p)) searchTerms.push(p);
            }
          }
        }
        const uniqueTerms = [...new Set(searchTerms)];

        // Find matching estimates
        const matching = allEstimates.filter((est: any) => {
          const text = JSON.stringify(est).toLowerCase().replace(/[-\/\\]/g, " ");
          return uniqueTerms.some((term: string) => term.length >= 3 && text.includes(term));
        });

        matchCount = matching.length;

        if (matching.length > 0) {
          const lines: string[] = [];
          lines.push(`Found ${matching.length} past estimates matching "${prompt}":\n`);

          for (const est of matching.slice(0, 15)) {
            lines.push(`--- Estimate #${est.DocNumber} for ${est.CustomerRef?.name} — Total: $${est.TotalAmt} ---`);
            for (const l of (est.Line || []).filter((l: any) => l.DetailType === "SalesItemLineDetail")) {
              const item = l.SalesItemLineDetail || {};
              const name = item.ItemRef?.name || "";
              const qty = item.Qty || 1;
              const price = item.UnitPrice || 0;
              const desc = l.Description || "";
              lines.push(`  Part: ${name} | Qty: ${qty} | Price: $${price} | Total: $${l.Amount} | Desc: ${desc}`);
            }
            lines.push("");
          }

          matchingEstimateText = lines.join("\n");
        } else {
          matchingEstimateText = `No past estimates found matching "${prompt}". Cannot generate estimate without pricing history.`;
        }
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
            content: `${matchingEstimateText}\n\n=== GENERATE NEW ESTIMATE ===\nCustomer: ${customerName || "N/A"}\nWork needed: ${prompt}\n\nBuild the estimate using the part numbers and pricing from the matching estimates above. Generate the JSON:`,
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

    const thinkClose = content.indexOf("</think>");
    if (thinkClose !== -1) content = content.substring(thinkClose + 8).trim();
    if (!content) content = (data.choices?.[0]?.message?.content || "").replace(/<\/?think>/g, "").trim();

    // Extract JSON
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*"lineItems"[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(content);
      }
    } catch {
      // If no JSON, return the text as a note
      return NextResponse.json({
        lineItems: [],
        notes: content.slice(0, 500),
        matchCount,
      });
    }

    return NextResponse.json({ ...result, matchCount });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Failed to generate estimate",
    }, { status: 500 });
  }
}
