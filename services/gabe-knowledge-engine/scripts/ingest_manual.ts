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

async function run() {
  const pages = await extractPdfPages(filePath);
  const chunks = chunkPages(pages, 500, 800);
  const embeddings = await embed(chunks.map((c) => c.text));
  await ensureCollection(embeddings[0].length);

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

  await qdrant.upsert(env.QDRANT_COLLECTION, { wait: true, points });
  console.log(`Inserted ${points.length} chunks.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
