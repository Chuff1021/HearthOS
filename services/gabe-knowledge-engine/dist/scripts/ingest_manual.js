"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const config_1 = require("../src/config");
const pdf_1 = require("../src/ingest/pdf");
const chunker_1 = require("../src/ingest/chunker");
const embeddings_1 = require("../src/embeddings");
const qdrant_1 = require("../src/retrieval/qdrant");
const ids_1 = require("../src/ingest/ids");
const retry_1 = require("../src/ingest/retry");
const args = process.argv.slice(2);
const [filePath, manualTitle, manufacturer, model, sourceUrl] = args;
if (!filePath || !manualTitle || !manufacturer || !model || !sourceUrl) {
    console.error("Usage: ingest_manual <filePath> <manualTitle> <manufacturer> <model> <sourceUrl>");
    process.exit(1);
}
const BATCH_SIZE = Number(process.env.INGEST_BATCH_SIZE ?? 75);
const CHECKPOINT_DIR = process.env.INGEST_CHECKPOINT_DIR ?? (0, node_path_1.join)(config_1.env.MANUALS_PATH, "checkpoints");
const DLQ_PATH = process.env.INGEST_DLQ_PATH ?? (0, node_path_1.join)(config_1.env.MANUALS_PATH, "dead-letter", "manual_ingest_dlq.jsonl");
function checkpointPath() {
    const key = (0, ids_1.stableUuid)(`${sourceUrl}|${manualTitle}|${manufacturer}|${model}`);
    return (0, node_path_1.join)(CHECKPOINT_DIR, `${key}.json`);
}
async function readCheckpoint() {
    try {
        const raw = await (0, promises_1.readFile)(checkpointPath(), "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function writeCheckpoint(cp) {
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(checkpointPath()), { recursive: true });
    await (0, promises_1.writeFile)(checkpointPath(), JSON.stringify(cp, null, 2));
}
async function writeDeadLetter(batchStart, batchSize, err) {
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(DLQ_PATH), { recursive: true });
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
    await (0, promises_1.appendFile)(DLQ_PATH, `${JSON.stringify(record)}\n`, "utf8");
}
async function upsertWithRetry(points) {
    return (0, retry_1.retryAsync)(() => qdrant_1.qdrant.upsert(config_1.env.QDRANT_COLLECTION, { wait: true, points }), {
        maxRetries: 6,
        baseDelayMs: 1000,
        maxDelayMs: 20_000,
        onRetry: (attempt, delay) => {
            console.warn(`Qdrant upsert failed (attempt ${attempt}). Retrying in ${delay}ms...`);
        }
    });
}
async function run() {
    const pages = await (0, pdf_1.extractPdfPages)(filePath);
    const chunks = (0, chunker_1.chunkPages)(pages, 500, 800, 2);
    if (chunks.length === 0) {
        console.log("No text chunks extracted; nothing to ingest.");
        return;
    }
    if (process.env.SKIP_COLLECTION_CHECK !== "1") {
        const [firstVector] = await (0, embeddings_1.embed)([chunks[0].text]);
        await (0, qdrant_1.ensureCollection)(firstVector.length);
    }
    const docType = inferDocType(manualTitle);
    const cp = await readCheckpoint();
    const resumeBatch = cp?.lastCompletedBatch ?? -1;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);
    for (let batchIndex = resumeBatch + 1; batchIndex < totalBatches; batchIndex += 1) {
        const start = batchIndex * BATCH_SIZE;
        const batchChunks = chunks.slice(start, start + BATCH_SIZE);
        const embeddings = await (0, embeddings_1.embed)(batchChunks.map((c) => c.text));
        const points = batchChunks.map((c, idx) => ({
            id: (0, ids_1.stableUuid)(`${sourceUrl}|${c.page}|${c.text}`),
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
        }
        catch (err) {
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
function inferDocType(title) {
    const t = title.toLowerCase();
    if (t.includes("installation manual") || t.includes("install manual"))
        return "installation";
    if (t.includes("owner") || t.includes("owner's") || t.includes("owners"))
        return "owner";
    if (t.includes("flyer") || t.includes("single page"))
        return "flyer";
    return "other";
}
