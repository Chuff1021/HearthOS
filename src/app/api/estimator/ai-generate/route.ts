import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/llama-3.1-nemotron-ultra-253b-v1";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "No database" }, { status: 500 });

  try {
    const { prompt, customerName } = await request.json();
    if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

    // Load pricing summary and install type guide — these are always populated
    let pricingSummary: Record<string, any> = {};
    let installTypeGuide: Record<string, string[]> = {};
    try {
      const rows = await sql`SELECT id, data FROM estimator_knowledge WHERE id IN (${"pricing"}, ${"install-types"})`;
      for (const row of rows) {
        if (row.id === "pricing") {
          pricingSummary = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as Record<string, any>;
        }
        if (row.id === "install-types") {
          const raw = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
          installTypeGuide = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, string[]>;
        }
      }
    } catch {}
    await sql.end();

    if (Object.keys(pricingSummary).length === 0) {
      return NextResponse.json({ error: "Pricing data not loaded yet. Please wait a moment and try again." }, { status: 503 });
    }

    // ── Parse prompt ──
    const pipeFeetMatch = prompt.match(/(\d+)\s*(?:ft|feet|foot|')/i);
    const pipeFeet = pipeFeetMatch ? Number(pipeFeetMatch[1]) : null;
    const isHorizontal = /horizontal/i.test(prompt);
    const isInsert = /\binsert\b|\bliner\b/i.test(prompt);
    const isService = /\b(clean|service|inspect|repair)\b/i.test(prompt);
    const mentionsStone = /\bstone\b|\bveneer\b|\bmasonry\b/.test(prompt.toLowerCase());
    const mentionsMantel = /\bmantel\b|\bmantle\b/.test(prompt.toLowerCase());

    const installType = isHorizontal ? "horizontal"
      : isInsert ? "insert"
      : isService ? "service"
      : "vertical";

    // ── Build search words (strip measurement noise) ──
    const ignoreWords = new Set([
      "vertical", "horizontal", "insert", "install", "installation",
      "feet", "foot", "ft", "pipe", "with", "and", "the", "for", "of", "a",
      "service", "repair", "clean", "replace", "new",
    ]);
    const rawTokens = prompt.toLowerCase().replace(/[-\/\\:]/g, " ").split(/\s+/);
    const searchWords: string[] = [];
    for (let i = 0; i < rawTokens.length; i++) {
      const w = rawTokens[i].replace(/[^a-z0-9]/g, "");
      if (!w || w.length < 2 || ignoreWords.has(w)) continue;
      const next = (rawTokens[i + 1] || "").replace(/[^a-z0-9]/g, "");
      // Skip measurement numbers like "20" before "feet"
      if (/^\d+$/.test(w) && (ignoreWords.has(next) || /^(feet|foot|ft|pipe|inch)/.test(next))) continue;
      searchWords.push(w);
    }

    // ── Find the best matching fireplace unit in pricingSummary ──
    // Score items: match on search words, prefer expensive items (fireplace units cost $1000+)
    const allItems = Object.values(pricingSummary) as any[];
    const scoredUnits = allItems.map((item: any) => {
      const text = (item.name || "").toLowerCase().replace(/[-\/\\:]/g, " ");
      let score = 0;
      for (const word of searchWords) {
        if (text.includes(word)) score += word.length * 2;
      }
      // Skip obvious non-unit items
      const nameLower = (item.name || "").toLowerCase();
      if (nameLower.includes("users charge") || nameLower.includes("sales tax")) return { item, score: 0 };
      if (nameLower.includes("services:") || nameLower.startsWith("services")) return { item, score: 0 };
      return { item, score };
    }).filter(s => s.score > 0).sort((a, b) => {
      // Primary: score; tiebreak: higher price = more likely a fireplace unit
      if (b.score !== a.score) return b.score - a.score;
      return (b.item.mostRecentPrice || 0) - (a.item.mostRecentPrice || 0);
    });

    const matchedUnit = scoredUnits[0]?.item || null;

    // ── Build component list from the matched unit's own invoice history ──
    // Use commonlyWith: items that actually appeared WITH this fireplace on real invoices
    // Fall back to installTypeGuide only if no history exists for this unit
    const unitComponents: string[] = matchedUnit?.commonlyWith?.length > 0
      ? matchedUnit.commonlyWith
      : (installTypeGuide[installType] || installTypeGuide["vertical"] || []).map((e: string) => e.replace(/ \(used \d+ times\)$/, ""));

    const componentLines = unitComponents
      .map((name: string) => {
        const p = pricingSummary[name];
        if (!p) return null;
        const price = p.mostRecentPrice || p.avgPrice || 0;
        if (price === 0) return null;
        const nameLower = name.toLowerCase();
        if (!mentionsStone && (nameLower.includes("stone") || nameLower.includes("veneer") || nameLower.includes("masonry"))) return null;
        if (!mentionsMantel && (nameLower.includes("mantel") || nameLower.includes("mantle"))) return null;
        return `${name} | $${price} each | qty typically ${p.avgQty}`;
      })
      .filter(Boolean)
      .slice(0, 20)
      .join("\n");

    // ── Build the AI prompt ──
    const unitLine = matchedUnit
      ? `Fireplace unit: ${matchedUnit.name} | $${matchedUnit.mostRecentPrice || matchedUnit.avgPrice} each`
      : `(No specific unit matched — use best judgment for the ${installType} fireplace)`;

    const aiPrompt = `You are building a fireplace installation estimate for Aaron's Fireplace Company.

Customer request: "${prompt}"${customerName ? `\nCustomer: ${customerName}` : ""}

FIREPLACE UNIT (main product):
${unitLine}

${installType.toUpperCase()} INSTALL COMPONENTS (from past jobs, real prices):
${componentLines}

RULES — read carefully:
- Use part numbers EXACTLY as shown above. Do NOT invent new part numbers.
- The partNumber field must be the exact name from the list (e.g. "Gas Pipe Simpson:46DVA-12")
- The description field should be a plain human-readable label
${pipeFeet ? `- Set pipe quantity to ${pipeFeet} feet total (split across pipe sections as needed)` : "- Use typical pipe quantity for this install"}
${isHorizontal ? "- HORIZONTAL install: use flex kit / wall termination components, not vertical straight pipe" : ""}
- Add a line: Users Charge = 3.5% of subtotal (all other items combined)
- Include the fireplace unit as the first line item
- Only include items listed above
${!mentionsStone ? "- Do NOT include stone, veneer, or masonry items" : ""}
${!mentionsMantel ? "- Do NOT include mantel items" : ""}

Return ONLY valid JSON, no markdown:
{"lineItems":[{"description":"Human label","partNumber":"Exact:QB:Name","quantity":1,"unitPrice":100,"total":100}],"notes":"brief summary"}`;

    // ── Call AI ──
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
    try { result = JSON.parse(content); } catch {
      try {
        const m = content.match(/\{[\s\S]*"lineItems"[\s\S]*\}/);
        if (m) result = JSON.parse(m[0]);
      } catch {}
    }

    // Fallback: build directly from invoice-history components without AI
    if (!result?.lineItems?.length) {
      const fallbackLines: any[] = [];
      if (matchedUnit) {
        fallbackLines.push({
          description: matchedUnit.name.split(":").pop() || matchedUnit.name,
          partNumber: matchedUnit.name,
          quantity: 1,
          unitPrice: matchedUnit.mostRecentPrice || matchedUnit.avgPrice,
          total: matchedUnit.mostRecentPrice || matchedUnit.avgPrice,
        });
      }
      for (const name of unitComponents.slice(0, 15)) {
        const p = pricingSummary[name];
        if (!p || (p.mostRecentPrice || p.avgPrice || 0) === 0) continue;
        const nameLower = name.toLowerCase();
        if (nameLower.includes("users charge") || nameLower.includes("sales tax")) continue;
        if (!mentionsStone && (nameLower.includes("stone") || nameLower.includes("veneer"))) continue;
        if (!mentionsMantel && (nameLower.includes("mantel") || nameLower.includes("mantle"))) continue;
        const isPipe = /\bpipe\b/i.test(name);
        const qty = isPipe && pipeFeet ? pipeFeet : Math.round(p.avgQty || 1);
        const price = p.mostRecentPrice || p.avgPrice;
        fallbackLines.push({
          description: name.split(":").pop() || name,
          partNumber: name,
          quantity: qty,
          unitPrice: price,
          total: Number((qty * price).toFixed(2)),
        });
      }
      const subtotal = fallbackLines.reduce((s, l) => s + l.total, 0);
      const uc = Number((subtotal * 0.035).toFixed(2));
      fallbackLines.push({ description: "Users Charge", partNumber: "Users Charge", quantity: 1, unitPrice: uc, total: uc });
      result = { lineItems: fallbackLines, notes: `Built from ${installType} install history.` };
    }

    return NextResponse.json({
      ...result,
      matchedProduct: matchedUnit ? (matchedUnit.name.split(":").pop() || matchedUnit.name) : `${installType} install`,
      basedOnInvoices: matchedUnit?.timesUsed || 0,
      catalogMatch: Boolean(matchedUnit),
      usingConsensus: false,
    });

  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate estimate" }, { status: 500 });
  }
}
