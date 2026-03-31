import { NextRequest, NextResponse } from "next/server";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/llama-3.1-nemotron-ultra-253b-v1";

const SYSTEM_PROMPT = `You are an estimate generator for Aaron's Fireplace, a fireplace installation and service company.

You will receive REAL past estimates from the company's QuickBooks. These contain actual part numbers, descriptions, quantities, and prices the company has charged.

YOUR JOB: Look at the matching past estimates and build a new estimate using the SAME part numbers and pricing. Adjust quantities based on what the customer needs (e.g., if they need 20 feet of pipe, calculate the right number of pipe sections).

RULES:
1. Use the EXACT part numbers and item names from the past estimates
2. Use the ACTUAL prices from past estimates — use the most recent price if it varies
3. Users Charge is typically 3.5% of the subtotal
4. If no matching past estimates are found, say so — do NOT make up part numbers or prices

CRITICAL — THE INSTALL TYPE DETERMINES WHICH VENTING COMPONENTS TO USE:

VERTICAL INSTALL (pipe goes up through the roof):
- Uses per-foot pipe sections: 77L71 (SV45L12) — quote at per-foot price x number of feet
- May need elbows: 77L76 (45 degree), 77L77 (90 degree)
- Needs firestop (98900029), roof flashing (77L78 or 77L79 or 77L80), collar (77L81)
- Vertical termination cap: H2152 (High Wind Vertical Termination)
- May need attic insulation shield (H3907)
- DO NOT include flex kits for vertical installs

HORIZONTAL INSTALL (pipe goes out through an exterior wall):
- Uses a FLEX KIT (like 77L89 Flex Kit) or horizontal pipe kit — NOT per-foot vertical pipe
- Does NOT use firestop, roof flashing, or vertical termination (H2152)
- Uses a HORIZONTAL wall termination cap — NOT H2152 which is for roofs
- May need wall thimble
- DO NOT include 77L71 per-foot pipe, roof flashing, or H2152 for horizontal installs
- Look for past estimates that used flex kits or horizontal kits

INSERT INSTALL (into existing masonry fireplace):
- Uses flex liner kit
- Needs liner, top plate, cap
- No exterior pipe or roof flashing

ALWAYS match the venting to the install type. If the customer says "horizontal" use horizontal components. If they say "vertical" use vertical components. Do not mix them.

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

    // Load learned knowledge base from database
    let knowledgeBase = "";
    try {
      const pg = (await import("postgres")).default;
      const sql = pg(process.env.DATABASE_URL || "", { prepare: false, max: 1 });
      const rows = await sql`SELECT type, data FROM estimator_knowledge`;
      await sql.end();

      for (const row of rows as any[]) {
        if (row.type === "pricing") {
          const pricing = row.data as Record<string, any>;
          const topItems = Object.values(pricing)
            .sort((a: any, b: any) => b.timesUsed - a.timesUsed)
            .slice(0, 100);
          knowledgeBase += "\n=== ITEM PRICING DATABASE (learned from invoices & estimates) ===\n";
          for (const i of topItems as any[]) {
            knowledgeBase += `${i.name}: $${i.avgPrice} avg ($${i.minPrice}-$${i.maxPrice}) | ${i.description || ""} | Used in: ${i.usedIn?.join(", ") || "various"}\n`;
          }
        }
        if (row.type === "install-types") {
          const guide = row.data as Record<string, string[]>;
          knowledgeBase += "\n=== INSTALL TYPE COMPONENT GUIDE (learned from past jobs) ===\n";
          for (const [type, components] of Object.entries(guide)) {
            knowledgeBase += `\n${type.toUpperCase()} INSTALL typical components:\n`;
            for (const comp of (components as string[]).slice(0, 15)) {
              knowledgeBase += `  - ${comp}\n`;
            }
          }
        }
      }
    } catch {}

    // Also fetch matching QB estimates for this specific model
    let matchingEstimateText = knowledgeBase;
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

        // Find matching estimates — require at least one term of 4+ chars to match
        const strongTerms = uniqueTerms.filter((t: string) => t.length >= 4);
        const matching = allEstimates.filter((est: any) => {
          const text = JSON.stringify(est).toLowerCase().replace(/[-\/\\]/g, " ");
          return strongTerms.some((term: string) => text.includes(term));
        });

        matchCount = matching.length;

        if (matching.length > 0) {
          const lines: string[] = [];
          lines.push(`Found ${matching.length} past estimates matching "${prompt}":\n`);

          for (const est of matching.slice(0, 5)) {
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
        max_tokens: 4096,
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

    // Extract JSON — strip markdown code fences and other wrapping
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let result;
    try {
      // Try direct parse first
      result = JSON.parse(content);
    } catch {
      try {
        // Try to find a JSON object with lineItems
        const jsonMatch = content.match(/\{[\s\S]*"lineItems"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        }
      } catch {}
    }

    // If still no result, try to extract individual line items from partial JSON
    if (!result || !result.lineItems) {
      try {
        const arrayMatch = content.match(/\[[\s\S]*\{[\s\S]*"description"[\s\S]*\}[\s\S]*\]/);
        if (arrayMatch) {
          const items = JSON.parse(arrayMatch[0]);
          result = { lineItems: items, notes: "Parsed from partial response" };
        }
      } catch {}
    }

    if (!result || !result.lineItems || result.lineItems.length === 0) {
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
