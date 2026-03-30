import { NextRequest, NextResponse } from "next/server";
import { searchManualSections, type ManualSearchResult } from "@/lib/manual-search";

const BASE_PROMPT = `You are GABE, a senior fireplace technician with 20+ years of experience. You work alongside the field techs at a fireplace service company and they come to you with questions throughout the day.

Talk like a knowledgeable coworker — natural, conversational, helpful. Not like a manual or a corporate chatbot.

CRITICAL RULES:
1. For model-specific questions (framing dimensions, clearances, gas pressures, venting specs, part numbers for a SPECIFIC fireplace model): ONLY answer if you have manufacturer manual excerpts provided below. NEVER guess or make up dimensions, clearances, or specs for a specific model. If no manual excerpts are provided for that model, say "I don't have that manual loaded yet — ask your dispatcher to ingest it."
2. For general knowledge questions (how to test a thermopile, general troubleshooting, how gas valves work, etc.): answer freely from your expertise.
3. When manual excerpts ARE provided: use ONLY the data from those excerpts for your answer. Quote the exact numbers from the manual. Mention the page.

How to respond:
- Be SHORT. 3-5 lines max for a simple spec question. Don't list every single clearance unless they asked for it.
- For framing dimensions: just give Height, Width, Depth. That's it. Don't add clearances, hearth requirements, or other specs unless asked.
- IMPORTANT: On fireplace spec pages, the DVP vs SLP pipe type affects the PIPE CHASE WIDTH AT THE TOP of the framing (a small opening for the vent pipe), NOT the fireplace rough opening width. The fireplace rough opening width is ONE number — do not list two different widths for different pipe types. If you see two different width numbers associated with pipe types, those are pipe chase dimensions, not the fireplace framing width.
- Be conversational. "The Quartz 36 framing is 38-1/4" tall, 42" wide (DVP pipe) or 32" wide (SLP pipe), and 16-1/4" deep. That's from page 12 of the install manual."
- Don't use bullet points or headers for simple answers. Just talk.
- Only use bullet lists if the answer genuinely has multiple distinct items.
- NEVER invent measurements. Use exact numbers from the manual.
- Don't repeat the model name in full with part numbers unless relevant.
- Don't add disclaimers like "please verify" or "cross-check with the full manual."
- End with just the page reference, not a list of every page searched.`;

function buildManualContext(results: ManualSearchResult[], hasModelSpecificQuery: boolean): string {
  if (results.length === 0) {
    if (hasModelSpecificQuery) {
      return `
## NO MANUAL DATA AVAILABLE
No manufacturer manual excerpts were found for this model. You MUST NOT guess or make up any model-specific specs (dimensions, clearances, pressures, part numbers). Instead, tell the tech: "I don't have that manual ingested yet. Go to the Manuals page and click 'Ingest for AI' on that manual, then ask me again."`;
    }
    return "";
  }

  const sections = results.map((r) => {
    const manualName = `${r.brand} ${r.model}${r.manualType ? ` (${r.manualType})` : ""}`;
    return `[${manualName} — Page ${r.pageStart}]\n${r.snippet}`;
  });

  return `
## MANUFACTURER MANUAL DATA (USE THIS — DO NOT GUESS)
The following are direct excerpts from the manufacturer's manual. Use ONLY these numbers in your answer. Do not substitute, round, or approximate any measurements. Quote them exactly as written.

${sections.join("\n\n---\n\n")}

IMPORTANT: Cite the page number for every fact. Example: "The manual says 81 inches tall (page 10)."
Add a "Sources:" line at the end listing each page you used.`;
}

function buildSourceLinks(results: ManualSearchResult[]): string {
  if (results.length === 0) return "";

  // Dedupe by manual (not by page) — show one link per manual
  const byManual = new Map<string, ManualSearchResult[]>();
  for (const r of results) {
    const existing = byManual.get(r.manualId) || [];
    existing.push(r);
    byManual.set(r.manualId, existing);
  }

  const links = Array.from(byManual.values()).map((pages) => {
    const r = pages[0];
    const name = `${r.brand} ${r.model}`;
    const pageNums = [...new Set(pages.map((p) => p.pageStart))].sort((a, b) => a - b);
    const pageList = pageNums.map((p) => `p.${p}`).join(", ");
    const firstPage = pageNums[0];
    return `[${name} — ${pageList}](${r.manualUrl}#page=${firstPage})`;
  });

  return "\n\n---\n**Sources:** " + links.join(" · ");
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: "NVIDIA_API_KEY is not configured",
        hint: "Add NVIDIA_API_KEY to Vercel environment variables",
      }, { status: 500 });
    }

    // Extract the latest user question for manual search
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";

    // Detect if this is a model-specific question (mentions dimensions, clearances, framing, specs + a model name/number)
    const specKeywords = /\b(dimension|framing|clearance|rough opening|specs|specification|gas pressure|btu|venting|vent pipe|part number|wiring)\b/i;
    const modelPattern = /\b(\d{2,4})\b|apex|bayport|meridian|dvl|dvs|rbv|echelon|marquis|quartz|sovereign|tribute/i;
    const hasModelSpecificQuery = specKeywords.test(lastUserMessage) && modelPattern.test(lastUserMessage);

    // Search manuals for relevant content
    let manualResults: ManualSearchResult[] = [];
    try {
      manualResults = await searchManualSections(lastUserMessage, { limit: 5 });
    } catch (e) {
      console.warn("[GABE-TEST] Manual search failed (non-fatal):", e);
    }

    // Build system prompt with manual context
    const manualContext = buildManualContext(manualResults, hasModelSpecificQuery);
    const systemPrompt = manualContext
      ? `${BASE_PROMPT}\n\n${manualContext}`
      : BASE_PROMPT;

    const model = process.env.NVIDIA_MODEL || "nvidia/llama-3.1-nemotron-ultra-253b-v1";

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "detailed thinking off" },
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 4096,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GABE-TEST] NVIDIA API error:", response.status, errorText);
      return NextResponse.json({
        error: `NVIDIA API returned ${response.status}`,
        details: errorText,
      }, { status: 502 });
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";

    let answer = rawContent;
    const thinkClose = rawContent.indexOf("</think>");
    if (thinkClose !== -1) {
      answer = rawContent.substring(thinkClose + "</think>".length).trim();
    }
    if (!answer) {
      answer = rawContent.replace(/<\/?think>/g, "").trim();
    }

    if (!answer) {
      return NextResponse.json({
        error: "Empty response from model",
        rawLength: rawContent.length,
        rawPreview: rawContent.substring(0, 200),
      }, { status: 500 });
    }

    // Append manual source links if we found matches
    if (manualResults.length > 0) {
      answer += buildSourceLinks(manualResults);
    }

    return NextResponse.json({
      answer,
      model,
      usage: data.usage || null,
      manualPagesUsed: manualResults.length,
    });
  } catch (err) {
    console.error("[GABE-TEST] Unhandled error:", err);
    return NextResponse.json({
      error: "Server error",
      message: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
