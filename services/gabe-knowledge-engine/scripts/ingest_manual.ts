import { env } from "../src/config";
import { extractPdfPages } from "../src/ingest/pdf";
import { chunkPages } from "../src/ingest/chunker";
import { embed } from "../src/embeddings";
import { ensureCollection, qdrant } from "../src/retrieval/qdrant";
import { randomUUID } from "node:crypto";

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

  const points = chunks.map((c, idx) => ({
    id: randomUUID(),
    vector: embeddings[idx],
    payload: {
      manual_title: manualTitle,
      manufacturer,
      model,
      page_number: c.page,
      source_url: sourceUrl,
      chunk_text: c.text,
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
