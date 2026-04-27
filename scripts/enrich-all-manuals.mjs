#!/usr/bin/env node
/**
 * Bulk manual enrichment script.
 *
 * 1. Ingests manuals that have no sections (text extraction from PDF)
 * 2. Creates AI spec summaries for all manuals with sections
 *
 * Run: node scripts/enrich-all-manuals.mjs
 * Requires: DATABASE_URL and NVIDIA_API_KEY in .env.local
 */

import postgres from "postgres";
import { config } from "dotenv";
import { resolve } from "path";

// Load env
config({ path: resolve(process.cwd(), ".env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/llama-3.1-nemotron-ultra-253b-v1";

if (!DATABASE_URL) { console.error("Missing DATABASE_URL"); process.exit(1); }
if (!NVIDIA_API_KEY) { console.error("Missing NVIDIA_API_KEY"); process.exit(1); }

const sql = postgres(DATABASE_URL, { prepare: false, max: 3 });

const EXTRACT_PROMPT = `You are a technical data extractor for fireplace installation and service manuals.

Given the extracted text from a fireplace manual, create a STRUCTURED SPECIFICATION SHEET containing every measurement, dimension, clearance, and technical spec found in the text.

Include these sections (only where data exists):
MODEL, TYPE, FRAMING DIMENSIONS, CLEARANCES TO COMBUSTIBLES, VENTING, GAS SPECIFICATIONS, ELECTRICAL, WEIGHT, FIREBOX DIMENSIONS

IMPORTANT: Only include data you can find in the text. Do not guess. Include measurements exactly as written.`;

// Rate limit helper: max 35 requests per minute to stay under NVIDIA's 40 RPM limit
let requestTimes = [];
async function rateLimitedFetch(url, options) {
  const now = Date.now();
  requestTimes = requestTimes.filter(t => now - t < 60000);
  if (requestTimes.length >= 35) {
    const waitMs = 60000 - (now - requestTimes[0]) + 500;
    console.log(`  Rate limit: waiting ${Math.round(waitMs / 1000)}s...`);
    await new Promise(r => setTimeout(r, waitMs));
  }
  requestTimes.push(Date.now());
  return fetch(url, options);
}

async function enrichManual(manualId, brand, model) {
  // Check if already enriched
  const existing = await sql`
    SELECT id FROM manual_sections WHERE manual_id = ${manualId} AND title = 'AI Spec Summary'
  `;
  if (existing.length > 0) return "already_done";

  // Get sections
  const sections = await sql`
    SELECT page_start, snippet FROM manual_sections
    WHERE manual_id = ${manualId}
    ORDER BY page_start ASC
  `;
  if (sections.length === 0) return "no_sections";

  const combined = sections
    .map(s => `[Page ${s.page_start}]\n${s.snippet}`)
    .join("\n\n---\n\n")
    .slice(0, 12000);

  try {
    const response = await rateLimitedFetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "detailed thinking off" },
          { role: "system", content: EXTRACT_PROMPT },
          { role: "user", content: `Extract all specifications from this ${brand} ${model} manual:\n\n${combined}` },
        ],
        temperature: 0.2,
        max_tokens: 2048,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`  LLM error ${response.status}: ${err.slice(0, 100)}`);
      return "llm_error";
    }

    const data = await response.json();
    let specSheet = data.choices?.[0]?.message?.content || "";
    const thinkClose = specSheet.indexOf("</think>");
    if (thinkClose !== -1) specSheet = specSheet.substring(thinkClose + 8).trim();
    if (!specSheet) specSheet = (data.choices?.[0]?.message?.content || "").replace(/<\/?think>/g, "").trim();

    if (!specSheet || specSheet.length < 20) return "empty_response";

    await sql`
      INSERT INTO manual_sections (id, manual_id, page_start, page_end, title, snippet, tags)
      VALUES (gen_random_uuid(), ${manualId}, 0, 0, 'AI Spec Summary', ${specSheet.slice(0, 10000)}, '["specs","ai-enriched","structured"]'::jsonb)
    `;

    return "enriched";
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    return "error";
  }
}

async function ingestManualPdf(manualId, brand, model, url) {
  // Check if already has sections
  const existing = await sql`SELECT COUNT(*) as cnt FROM manual_sections WHERE manual_id = ${manualId}`;
  if (existing[0].cnt > 0) return "already_ingested";

  try {
    // Fetch PDF
    const pdfRes = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!pdfRes.ok) return "pdf_fetch_failed";

    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // Parse with pdf-parse
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const pages = new Map();

    await pdfParse(pdfBuffer, {
      pagerender: async (pageData) => {
        const textContent = await pageData.getTextContent();
        const text = textContent.items.map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
        pages.set(pageData.pageIndex + 1, text);
        return text;
      },
    });

    let ingested = 0;
    for (const [pageNum, text] of Array.from(pages.entries()).sort((a, b) => a[0] - b[0])) {
      if (!text.trim()) continue;

      await sql`
        INSERT INTO manual_sections (id, manual_id, page_start, page_end, title, snippet, tags)
        VALUES (gen_random_uuid(), ${manualId}, ${pageNum}, ${pageNum}, ${`Page ${pageNum}`}, ${text.slice(0, 10000)}, '["text"]'::jsonb)
      `;
      ingested++;
    }

    return `ingested_${ingested}_pages`;
  } catch (err) {
    console.error(`  Ingest error: ${err.message}`);
    return "ingest_error";
  }
}

async function main() {
  console.log("=== HearthOS Manual Enrichment Pipeline ===\n");

  // Step 1: Ingest manuals that have no sections
  console.log("STEP 1: Ingesting manuals with no extracted text...");
  const unIngested = await sql`
    SELECT m.id, m.brand, m.model, m.url FROM manuals m
    WHERE m.is_active = true
    AND NOT EXISTS (SELECT 1 FROM manual_sections ms WHERE ms.manual_id = m.id)
    AND m.url LIKE 'http%'
    AND m.url LIKE '%.pdf'
    ORDER BY m.brand, m.model
  `;
  console.log(`  Found ${unIngested.length} manuals to ingest\n`);

  let ingestResults = { ingested: 0, failed: 0, skipped: 0 };
  for (let i = 0; i < unIngested.length; i++) {
    const m = unIngested[i];
    process.stdout.write(`  [${i + 1}/${unIngested.length}] ${m.brand} ${m.model}... `);
    const result = await ingestManualPdf(m.id, m.brand, m.model, m.url);
    console.log(result);
    if (result.startsWith("ingested")) ingestResults.ingested++;
    else if (result === "already_ingested") ingestResults.skipped++;
    else ingestResults.failed++;
  }
  console.log(`\n  Ingest results: ${ingestResults.ingested} ingested, ${ingestResults.skipped} skipped, ${ingestResults.failed} failed\n`);

  // Step 2: Enrich all manuals with AI spec summaries
  console.log("STEP 2: Creating AI spec summaries...");
  const allManuals = await sql`
    SELECT m.id, m.brand, m.model FROM manuals m
    WHERE m.is_active = true
    AND EXISTS (SELECT 1 FROM manual_sections ms WHERE ms.manual_id = m.id)
    ORDER BY m.brand, m.model
  `;
  console.log(`  Found ${allManuals.length} manuals to enrich\n`);

  let enrichResults = { enriched: 0, already: 0, failed: 0, noSections: 0 };
  for (let i = 0; i < allManuals.length; i++) {
    const m = allManuals[i];
    process.stdout.write(`  [${i + 1}/${allManuals.length}] ${m.brand} ${m.model}... `);
    const result = await enrichManual(m.id, m.brand, m.model);
    console.log(result);
    if (result === "enriched") enrichResults.enriched++;
    else if (result === "already_done") enrichResults.already++;
    else if (result === "no_sections") enrichResults.noSections++;
    else enrichResults.failed++;
  }
  console.log(`\n  Enrich results: ${enrichResults.enriched} enriched, ${enrichResults.already} already done, ${enrichResults.failed} failed, ${enrichResults.noSections} no sections\n`);

  console.log("=== DONE ===");
  await sql.end();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
