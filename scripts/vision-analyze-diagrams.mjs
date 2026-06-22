#!/usr/bin/env node
import postgres from "postgres";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";

const DB_URL = process.env.DATABASE_URL;
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;

if (!DB_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

if (!NVIDIA_KEY) {
  console.error("Missing NVIDIA_API_KEY");
  process.exit(1);
}

const sql = postgres(DB_URL, { prepare: false, max: 2 });

async function visionAnalyzePage(pdfUrl, pageNum, brand, model) {
  const pdfPath = "/tmp/vision_manual.pdf";

  for (const tryUrl of [pdfUrl, "https://web.archive.org/web/2024/" + pdfUrl]) {
    try {
      const res = await fetch(tryUrl, { signal: AbortSignal.timeout(30000), redirect: "follow" });
      const ct = res.headers.get("content-type") || "";
      if (res.ok && (ct.includes("pdf") || ct.includes("octet"))) {
        writeFileSync(pdfPath, Buffer.from(await res.arrayBuffer()));
        break;
      }
    } catch {}
  }

  if (!existsSync(pdfPath)) return null;

  try {
    execSync(`pdftoppm -png -r 200 -f ${pageNum} -l ${pageNum} ${pdfPath} /tmp/vision_page`, { timeout: 15000 });
  } catch { return null; }

  const imgFile = `/tmp/vision_page-${pageNum}.png`;
  if (!existsSync(imgFile)) return null;

  const imgBuffer = readFileSync(imgFile);
  if (imgBuffer.length < 10000) return null;

  const base64 = imgBuffer.toString("base64");

  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + NVIDIA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "moonshotai/kimi-k2.5",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: `This is page ${pageNum} from a ${brand} ${model} fireplace installation manual. Read the diagram and table. Extract ALL framing measurements: rough opening width, height, depth, pipe chase dimensions, clearances to combustibles, and any 45-degree corner install dimensions. Give exact measurements with units. Be specific about what each measurement physically represents based on where the arrows point in the diagram.` },
          { type: "image_url", image_url: { url: "data:image/png;base64," + base64 } }
        ],
      }],
      temperature: 0.6, max_tokens: 4096, stream: false,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning || null;
}

const pages = await sql`
  SELECT ms.id, ms.page_start, m.id as manual_id, m.brand, m.model, m.url
  FROM manual_sections ms
  JOIN manuals m ON m.id = ms.manual_id
  WHERE m.is_active = true AND ms.page_start > 0
    AND (LOWER(ms.snippet) LIKE ${"%" + "framing dimension" + "%"} OR LOWER(ms.snippet) LIKE ${"%" + "minimum framing" + "%"})
    AND LENGTH(ms.snippet) < 500
    AND ms.snippet NOT LIKE ${"%" + "VISION-ANALYZED" + "%"}
  ORDER BY m.brand, m.model, ms.page_start
`;

console.log("Processing " + pages.length + " diagram pages with Kimi K2.5 vision...\n");
let done = 0, failed = 0;

for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  process.stdout.write("[" + (i + 1) + "/" + pages.length + "] " + p.brand + " " + p.model + " p." + p.page_start + "... ");

  const analysis = await visionAnalyzePage(p.url, p.page_start, p.brand, p.model);

  if (analysis && analysis.length > 50) {
    const cleanSnippet = `${p.brand} ${p.model} Installation Manual - Page ${p.page_start}\n\n[VISION-ANALYZED FROM DIAGRAM BY KIMI K2.5]\n${analysis}`;
    await sql`UPDATE manual_sections SET snippet = ${cleanSnippet.slice(0, 10000)}, updated_at = now() WHERE id = ${p.id}`;
    console.log("analyzed (" + analysis.length + " chars)");
    done++;
  } else {
    console.log("failed");
    failed++;
  }

  await new Promise(r => setTimeout(r, 2000));
}

console.log("\nDone! Analyzed: " + done + " | Failed: " + failed);
await sql.end();
