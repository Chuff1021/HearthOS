import { env } from "../src/config";
import { extractPdfPages } from "../src/ingest/pdf";
import { chunkPages } from "../src/ingest/chunker";
import { embed } from "../src/embeddings";
import { ensureCollection, qdrant } from "../src/retrieval/qdrant";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const [filePath, manualTitle, manufacturer, model, sourceUrl] = args;

if (!filePath || !manualTitle || !manufacturer || !model || !sourceUrl) {
  console.error("Usage: ingest_manual <filePath> <manualTitle> <manufacturer> <model> <sourceUrl>");
  process.exit(1);
}

const BATCH_SIZE = 100;
const MAX_RETRIES = 5;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertWithRetry(points: any[], attempt = 1) {
  try {
    await qdrant.upsert(env.QDRANT_COLLECTION, { wait: true, points });
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    const delay = 1000 * attempt;
    console.warn(`Qdrant upsert failed (attempt ${attempt}). Retrying in ${delay}ms...`);
    await sleep(delay);
    return upsertWithRetry(points, attempt + 1);
  }
}

async function run() {
  const pages = await extractPdfPages(filePath);
  const chunks = chunkPages(pages, 500, 800);
  const embeddings = await embed(chunks.map((c) => c.text));
  if (process.env.SKIP_COLLECTION_CHECK !== "1") {
    await ensureCollection(embeddings[0].length);
  }
  const docType = inferDocType(manualTitle);

  const points = chunks.map((c, idx) => ({
    id: stableUuid(`${sourceUrl}|${c.page}|${c.text}`),
    vector: embeddings[idx],
    payload: {
      manual_title: manualTitle,
      manufacturer,
      model,
      page_number: c.page,
      source_url: sourceUrl,
      chunk_text: c.text,
      section_title: c.section_title,
      doc_type: docType,
      source_type: "manual"
    }
  }));

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await upsertWithRetry(batch);
    console.log(`Inserted ${Math.min(i + BATCH_SIZE, points.length)} / ${points.length} chunks...`);
  }

  console.log(`Inserted ${points.length} chunks.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

function inferDocType(title: string) {
  const t = title.toLowerCase();
  if (t.includes("installation manual") || t.includes("install manual")) return "installation";
  if (t.includes("owner") || t.includes("owner's") || t.includes("owners")) return "owner";
  if (t.includes("flyer") || t.includes("single page")) return "flyer";
  return "other";
}

function stableUuid(input: string) {
  const hex = createHash("sha1").update(input).digest("hex").slice(0, 32);
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  // Set UUID version 5 (0101) and variant (10xx)
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const b = bytes.map((n) => n.toString(16).padStart(2, "0"));
  return `${b.slice(0, 4).join("")}-${b.slice(4, 6).join("")}-${b
    .slice(6, 8)
    .join("")}-${b.slice(8, 10).join("")}-${b.slice(10, 16).join("")}`;
}
