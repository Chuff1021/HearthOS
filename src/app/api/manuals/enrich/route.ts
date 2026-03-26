import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

export const maxDuration = 300;

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/llama-3.1-nemotron-ultra-253b-v1";

const EXTRACT_PROMPT = `You are a technical data extractor for fireplace installation and service manuals.

Given the extracted text from a fireplace manual, create a STRUCTURED SPECIFICATION SHEET containing every measurement, dimension, clearance, and technical spec found in the text.

Format your output EXACTLY like this (only include sections where data exists):

MODEL: [brand and model name]
TYPE: [gas fireplace / wood stove / pellet stove / insert / etc]

FRAMING DIMENSIONS:
- Standard install width: [value]
- Standard install depth: [value]
- Standard install height: [value]
- 45° corner install dimensions: [values if present]

CLEARANCES TO COMBUSTIBLES:
- Top: [value]
- Sides: [value]
- Back: [value]
- Floor: [value]
- Mantel clearance: [value]

VENTING:
- Vent type: [direct vent / b-vent / natural draft / etc]
- Pipe diameter: [value]
- Max horizontal run: [value]
- Max vertical rise: [value]
- Elbow equivalent length: [value]

GAS SPECIFICATIONS:
- Input BTU: [value]
- Gas type: [natural / LP / both]
- Inlet pressure: [value]
- Manifold pressure: [value]

ELECTRICAL:
- Voltage: [value]
- Amperage: [value]

WEIGHT: [value]
FIREBOX DIMENSIONS: [width x height x depth if present]

IMPORTANT: Only include data you can find in the text. Do not guess or make up values. If a measurement appears in the text, include it exactly as written.`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }

  const { manualId } = await request.json();
  if (!manualId) {
    return NextResponse.json({ error: "manualId required" }, { status: 400 });
  }

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    // Get manual info
    const manuals = await sql`SELECT id, brand, model, type FROM manuals WHERE id = ${manualId} LIMIT 1`;
    if (manuals.length === 0) {
      await sql.end();
      return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    }
    const manual = manuals[0];

    // Check if already enriched
    const existing = await sql`
      SELECT id FROM manual_sections WHERE manual_id = ${manualId} AND title = 'AI Spec Summary'
    `;
    if (existing.length > 0) {
      await sql.end();
      return NextResponse.json({ status: "already_enriched", manualId });
    }

    // Get all sections for this manual
    const sections = await sql`
      SELECT page_start, snippet FROM manual_sections
      WHERE manual_id = ${manualId}
      ORDER BY page_start ASC
    `;

    if (sections.length === 0) {
      await sql.end();
      return NextResponse.json({ status: "no_sections", manualId });
    }

    // Combine page text (cap at ~12k chars to fit in context)
    const combined = sections
      .map((s: any) => `[Page ${s.page_start}]\n${s.snippet}`)
      .join("\n\n---\n\n")
      .slice(0, 12000);

    // Ask LLM to extract structured specs
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
          { role: "system", content: EXTRACT_PROMPT },
          {
            role: "user",
            content: `Extract all specifications from this ${manual.brand} ${manual.model} manual:\n\n${combined}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 2048,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      await sql.end();
      return NextResponse.json({ error: `LLM error: ${response.status}`, details: err }, { status: 502 });
    }

    const data = await response.json();
    let specSheet = data.choices?.[0]?.message?.content || "";

    // Strip <think> tags
    const thinkClose = specSheet.indexOf("</think>");
    if (thinkClose !== -1) {
      specSheet = specSheet.substring(thinkClose + "</think>".length).trim();
    }
    if (!specSheet) {
      specSheet = specSheet.replace(/<\/?think>/g, "").trim();
    }

    if (!specSheet || specSheet.length < 20) {
      await sql.end();
      return NextResponse.json({ status: "no_specs_extracted", manualId });
    }

    // Store as a special summary section at page 0
    await sql`
      INSERT INTO manual_sections (id, manual_id, page_start, page_end, title, snippet, tags)
      VALUES (
        gen_random_uuid(),
        ${manualId},
        0,
        0,
        'AI Spec Summary',
        ${specSheet.slice(0, 10000)},
        '["specs", "ai-enriched", "structured"]'::jsonb
      )
    `;

    await sql.end();
    return NextResponse.json({
      status: "enriched",
      manualId,
      brand: manual.brand,
      model: manual.model,
      specLength: specSheet.length,
    });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Failed",
    }, { status: 500 });
  }
}
