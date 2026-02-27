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
  const manualResults = await searchManualChunks(queryVector, 8);
  const boostedManualResults = applyKeywordBoost(body.question, manualResults);
  const { filtered: hintedManualResults } = applyManualHintFilter(body.question, boostedManualResults);
  const manualMatches = hintedManualResults.filter((r) => r.score >= similarityThreshold);

  let selectedChunks: RetrievedChunk[] = [];
  if (manualMatches.length > 0) {
    selectedChunks = manualMatches
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  } else {
    // Fallback: still use top manual chunks even if below threshold
    if (hintedManualResults.length > 0) {
      selectedChunks = hintedManualResults
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    } else {
      const webResults = await braveSearch(body.question, 5);
    for (const result of webResults) {
      const { title, text } = await fetchPageText(result.url);
      const chunks = chunkWebText(text, 800, 100);
      const embeddings = await embed(chunks);
      const scored: RetrievedChunk[] = embeddings.map((vec, idx) => ({
        score: cosineSimilarity(queryVector, vec),
        chunk_text: chunks[idx],
        source_url: result.url,
        manual_title: "",
        manufacturer: "",
        model: "",
        page_number: 0,
        section: title || result.title,
        source_type: "web"
      }));
      const top = scored
        .filter((s) => s.score >= similarityThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      selectedChunks.push(...top);
      if (selectedChunks.length >= 3) break;
    }

    selectedChunks = selectedChunks.slice(0, 3);
    }
  }

  if (selectedChunks.length === 0) {
    return {
      answer: "This information is not available in verified manufacturer documentation.",
      source_type: "none",
      confidence: 0
    };
  }

  const chosenChunks = selectedChunks.slice(0, 1);
  try {
    const answer = await callGroq(chosenChunks, body.question);
    validateAnswer(answer, chosenChunks);
    return answer;
  } catch (err) {
    request.log.error({ err }, "GABE answer validation failed");
    const fallback = buildExtractiveAnswer(body.question, chosenChunks[0]);
    if (fallback) return fallback;
    return {
      answer: "This information is not available in verified manufacturer documentation.",
      source_type: "none",
      confidence: 0
    };
  }
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

function buildExtractiveAnswer(question: string, chunk: RetrievedChunk | undefined) {
  if (!chunk || chunk.source_type !== "manual") return null;
  const quote = extractQuote(question, chunk.chunk_text);
  return {
    answer: `Manual states: "${quote}"`,
    source_type: "manual",
    manual_title: chunk.manual_title,
    page_number: chunk.page_number,
    source_url: chunk.source_url,
    quote,
    confidence: 60
  };
}

function extractQuote(question: string, text: string) {
  const q = question.toLowerCase();
  const keywords: string[] = [];
  if (q.includes("outside air") || q.includes("combustion air") || q.includes("air intake") || q.includes("oak")) {
    keywords.push("outside air", "combustion air", "air intake", "outside combustion", "oak");
  }

  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const pick = sentences.find((s) => keywords.some((k) => s.toLowerCase().includes(k)))
    ?? sentences[0]
    ?? text;

  const words = pick.split(/\s+/).slice(0, 25);
  return words.join(" ");
}

function applyKeywordBoost(question: string, results: RetrievedChunk[]) {
  const q = question.toLowerCase();
  const keywords: string[] = [];
  if (q.includes("outside air") || q.includes("combustion air") || q.includes("air intake") || q.includes("oak")) {
    keywords.push("outside air", "combustion air", "air intake", "outside combustion", "oak");
  }
  if (keywords.length === 0) return results;

  return results.map((r) => {
    const text = r.chunk_text.toLowerCase();
    const hit = keywords.some((k) => text.includes(k));
    return hit ? { ...r, score: Math.min(1, r.score + 0.08) } : r;
  });
}

function applyManualHintFilter(question: string, results: RetrievedChunk[]) {
  const q = question.toLowerCase();
  const brandHints = ["fpx", "lopi", "majestic", "monessen"].filter((b) => q.includes(b));
  const tokens = q
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .filter((t) => t.length >= 2);

  const stop = new Set([
    "does", "the", "and", "allow", "outside", "combustion", "air", "kit", "kits",
    "use", "can", "for", "with", "manual", "require", "required", "need", "needs",
    "installation", "owner", "owners", "install", "page"
  ]);

  const modelTokens = tokens.filter((t) => !stop.has(t) && !brandHints.includes(t));

  const scored = results.map((r) => {
    const hay = `${r.manual_title} ${r.manufacturer} ${r.model}`.toLowerCase();
    const brandHit = brandHints.length === 0 ? 0 : brandHints.filter((b) => hay.includes(b)).length;
    const modelHit = modelTokens.filter((t) => hay.includes(t)).length;
    const hitCount = brandHit + modelHit;
    return { r, hitCount, brandHit, modelHit };
  });

  // If brand is specified and any results match the brand, only keep brand matches.
  if (brandHints.length > 0) {
    const brandMatches = scored.filter((s) => s.brandHit > 0);
    if (brandMatches.length > 0) {
      const preferred = brandMatches.filter((s) => s.modelHit >= 2).map((s) => s.r);
      return { filtered: preferred.length > 0 ? preferred : brandMatches.map((s) => s.r) };
    }
  }

  const preferred = scored.filter((s) => s.hitCount >= 2).map((s) => s.r);
  if (preferred.length > 0) {
    return { filtered: preferred };
  }

  return { filtered: results };
}

app.listen({ port: Number(env.PORT), host: "0.0.0.0" });
