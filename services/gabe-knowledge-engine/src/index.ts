import Fastify from "fastify";
import { env, similarityThreshold } from "./config";
import { embed } from "./embeddings";
import { extractPdfPages } from "./ingest/pdf";
import { chunkPages } from "./ingest/chunker";
import { ensureCollection, qdrant } from "./retrieval/qdrant";
import { searchManualChunks } from "./retrieval/search";
import { braveSearch } from "./web/brave";
import { fetchPageText, chunkWebText } from "./web/extract";
import { callGroq } from "./llm/groq";
import { validateAnswer } from "./validation/validate";
import { RetrievedChunk } from "./types";
import { randomUUID } from "node:crypto";

const app = Fastify({ logger: { level: env.LOG_LEVEL } });

app.get("/health", async () => ({ ok: true }));

app.post("/ingest/manual", async (request, reply) => {
  const body = request.body as {
    file_path: string;
    manual_title: string;
    manufacturer: string;
    model: string;
    source_url: string;
  };

  if (!body?.file_path || !body.manual_title || !body.manufacturer || !body.model || !body.source_url) {
    return reply.status(400).send({ error: "file_path, manual_title, manufacturer, model, source_url required" });
  }

  const pages = await extractPdfPages(body.file_path);
  const chunks = chunkPages(pages, 500, 800);
  const embeddings = await embed(chunks.map((c) => c.text));

  await ensureCollection(embeddings[0].length);

  const points = chunks.map((c, idx) => ({
    id: randomUUID(),
    vector: embeddings[idx],
    payload: {
      manual_title: body.manual_title,
      manufacturer: body.manufacturer,
      model: body.model,
      page_number: c.page,
      source_url: body.source_url,
      chunk_text: c.text,
      source_type: "manual"
    }
  }));

  await qdrant.upsert(env.QDRANT_COLLECTION, { wait: true, points });

  return { ok: true, chunks: points.length };
});

app.post("/query", async (request, reply) => {
  const body = request.body as { question: string };
  if (!body?.question) return reply.status(400).send({ error: "question required" });

  const [queryVector] = await embed([body.question]);
  const manualResults = await searchManualChunks(queryVector, 5);
  const manualMatches = manualResults.filter((r) => r.score >= similarityThreshold);

  let selectedChunks: RetrievedChunk[] = [];
  if (manualMatches.length > 0) {
    selectedChunks = manualMatches.slice(0, 3);
  } else {
    const webResults = await braveSearch(body.question, 5);
    for (const result of webResults) {
      const { title, text } = await fetchPageText(result.url);
      const chunks = chunkWebText(text, 800, 100);
      const embeddings = await embed(chunks);
      const scored = embeddings.map((vec, idx) => ({
        score: cosineSimilarity(queryVector, vec),
        chunk_text: chunks[idx],
        source_url: result.url,
        manual_title: "",
        manufacturer: "",
        model: "",
        page_number: 0,
        section: title || result.title,
        source_type: "web" as const
      }));
      const top = scored.filter((s) => s.score >= similarityThreshold).sort((a, b) => b.score - a.score).slice(0, 3);
      selectedChunks.push(...top);
      if (selectedChunks.length >= 3) break;
    }

    selectedChunks = selectedChunks.slice(0, 3);
  }

  if (selectedChunks.length === 0) {
    return {
      answer: "This information is not available in verified manufacturer documentation.",
      source_type: "none",
      confidence: 0
    };
  }

  const answer = await callGroq(selectedChunks, body.question);
  validateAnswer(answer, selectedChunks);
  return answer;
});

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

app.listen({ port: Number(env.PORT), host: "0.0.0.0" });
