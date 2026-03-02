import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env } from "../src/config";
import { extractPdfPages } from "../src/ingest/pdf";
import { chunkPages } from "../src/ingest/chunker";
import { embed } from "../src/embeddings";
import { ensureCollection, qdrant } from "../src/retrieval/qdrant";
import { stableUuid } from "../src/ingest/ids";
import { retryAsync } from "../src/ingest/retry";

const args = process.argv.slice(2);
const [filePath, manualTitle, manufacturer, model, sourceUrl] = args;

if (!filePath || !manualTitle || !manufacturer || !model || !sourceUrl) {
  console.error("Usage: ingest_manual <filePath> <manualTitle> <manufacturer> <model> <sourceUrl>");
  process.exit(1);
}

const BATCH_SIZE = Number(process.env.INGEST_BATCH_SIZE ?? 75);
const CHECKPOINT_DIR = process.env.INGEST_CHECKPOINT_DIR ?? join(env.MANUALS_PATH, "checkpoints");
const DLQ_PATH = process.env.INGEST_DLQ_PATH ?? join(env.MANUALS_PATH, "dead-letter", "manual_ingest_dlq.jsonl");

type Checkpoint = {
  sourceUrl: string;
  manualTitle: string;
  manufacturer: string;
  model: string;
  totalChunks: number;
  lastCompletedBatch: number;
  updatedAt: string;
};

function checkpointPath() {
  const key = stableUuid(`${sourceUrl}|${manualTitle}|${manufacturer}|${model}`);
  return join(CHECKPOINT_DIR, `${key}.json`);
}

async function readCheckpoint(): Promise<Checkpoint | null> {
  try {
    const raw = await readFile(checkpointPath(), "utf8");
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

async function writeCheckpoint(cp: Checkpoint) {
  await mkdir(dirname(checkpointPath()), { recursive: true });
  await writeFile(checkpointPath(), JSON.stringify(cp, null, 2));
}

async function writeDeadLetter(batchStart: number, batchSize: number, err: unknown) {
  await mkdir(dirname(DLQ_PATH), { recursive: true });
  const record = {
    ts: new Date().toISOString(),
    source_url: sourceUrl,
    manual_title: manualTitle,
    manufacturer,
    model,
    file_path: filePath,
    batch_start: batchStart,
    batch_size: batchSize,
    error: String(err)
  };
  await appendFile(DLQ_PATH, `${JSON.stringify(record)}\n`, "utf8");
}

async function upsertWithRetry(points: any[]) {
  return retryAsync(
    () => qdrant.upsert(env.QDRANT_COLLECTION, { wait: true, points }),
    {
      maxRetries: 6,
      baseDelayMs: 1000,
      maxDelayMs: 20_000,
      onRetry: (attempt, delay) => {
        console.warn(`Qdrant upsert failed (attempt ${attempt}). Retrying in ${delay}ms...`);
      }
    }
  );
}

async function run() {
  const pages = await extractPdfPages(filePath);
  const chunks = chunkPages(pages, 500, 800, 2);

  if (chunks.length === 0) {
    console.log("No text chunks extracted; nothing to ingest.");
    return;
  }

  if (process.env.SKIP_COLLECTION_CHECK !== "1") {
    const [firstVector] = await embed([chunks[0].text]);
    await ensureCollection(firstVector.length);
  }

  const docType = inferDocType(manualTitle);
  const cp = await readCheckpoint();
  const resumeBatch = cp?.lastCompletedBatch ?? -1;
  const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

  for (let batchIndex = resumeBatch + 1; batchIndex < totalBatches; batchIndex += 1) {
    const start = batchIndex * BATCH_SIZE;
    const batchChunks = chunks.slice(start, start + BATCH_SIZE);
    const embeddings = await embed(batchChunks.map((c) => c.text));

    const points = batchChunks.map((c, idx) => ({
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

    try {
      await upsertWithRetry(points);
      await writeCheckpoint({
        sourceUrl,
        manualTitle,
        manufacturer,
        model,
        totalChunks: chunks.length,
        lastCompletedBatch: batchIndex,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      await writeDeadLetter(start, points.length, err);
      throw err;
    }

    console.log(`Inserted batch ${batchIndex + 1}/${totalBatches} (${Math.min(start + BATCH_SIZE, chunks.length)} / ${chunks.length} chunks)...`);
  }

  console.log(`Inserted ${chunks.length} chunks.`);
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
