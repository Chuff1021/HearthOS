import Fastify from "fastify";
import { env, manualSelectionMinMargin, minEvidenceChunks, similarityThreshold } from "./config";
import { embed } from "./embeddings";
import { extractPdfPages } from "./ingest/pdf";
import { chunkPages } from "./ingest/chunker";
import { ensureCollection, qdrant } from "./retrieval/qdrant";
import { keywordSearchManualChunks, searchManualChunks } from "./retrieval/search";
import { callGroq } from "./llm/groq";
import { validateAnswer } from "./validation/validate";
import { RetrievedChunk } from "./types";
import { stableUuid } from "./ingest/ids";
import { retryAsync } from "./ingest/retry";

const app = Fastify({ logger: { level: env.LOG_LEVEL } });

const metrics = {
  gabe_queries_total: 0,
  gabe_wrong_manual_total: 0,
  gabe_missing_citation_total: 0
};

app.get("/health", async () => ({ ok: true }));
app.get("/metrics", async () => {
  const lines = [
    "# TYPE gabe_queries_total counter",
    `gabe_queries_total ${metrics.gabe_queries_total}`,
    "# TYPE gabe_wrong_manual_total counter",
    `gabe_wrong_manual_total ${metrics.gabe_wrong_manual_total}`,
    "# TYPE gabe_missing_citation_total counter",
    `gabe_missing_citation_total ${metrics.gabe_missing_citation_total}`
  ];
  return lines.join("\n") + "\n";
});

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
  const chunks = chunkPages(pages, 450, 750, 2);
  if (chunks.length === 0) return reply.status(400).send({ error: "no_extractable_text" });

  const embeddings = await embed(chunks.map((c) => c.text));
  await ensureCollection(embeddings[0].length);
  const docType = inferDocType(body.manual_title);

  const points = chunks.map((c, idx) => ({
    id: stableUuid(`${body.source_url}|${c.page}|${c.text}`),
    vector: embeddings[idx],
    payload: {
      manual_title: body.manual_title,
      manufacturer: body.manufacturer,
      model: body.model,
      page_number: c.page,
      source_url: body.source_url,
      chunk_text: c.text,
      section_title: c.section_title,
      doc_type: docType,
      source_type: "manual"
    }
  }));

  const batchSize = 75;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await retryAsync(
      () => qdrant.upsert(env.QDRANT_COLLECTION, { wait: true, points: batch }),
      {
        maxRetries: 6,
        baseDelayMs: 1000,
        maxDelayMs: 20000,
        onRetry: (attempt, delayMs, err) => {
          request.log.warn({ err, attempt, delayMs }, "manual ingest upsert retry");
        }
      }
    );
  }

  return { ok: true, chunks: points.length };
});

app.post("/query", async (request, reply) => {
  const body = request.body as { question: string };
  if (!body?.question) return reply.status(400).send({ error: "question required" });

  metrics.gabe_queries_total += 1;

  const [queryVector] = await embed([body.question]);
  const keywordTerms = buildKeywordTerms(body.question);

  const [vectorResults, keywordResults] = await Promise.all([
    searchManualChunks(queryVector, 80),
    keywordSearchManualChunks(keywordTerms, 80)
  ]);

  const hybridResults = fuseHybridResults(vectorResults, keywordResults);
  const boostedResults = applyKeywordBoost(body.question, hybridResults);
  const { filtered: hinted } = applyManualHintFilter(body.question, boostedResults);
  const { filtered: technical } = applyTechnicalFilter(body.question, hinted);

  const dynamicThreshold = Math.max(0.66, similarityThreshold - 0.08);
  const strongCandidates = technical.filter((r) => r.source_type === "manual" && r.score >= similarityThreshold);
  const fallbackCandidates = technical.filter((r) => r.source_type === "manual" && r.score >= dynamicThreshold);
  const candidatePool = strongCandidates.length > 0 ? strongCandidates : fallbackCandidates;

  const selectedChunks = selectDeterministicManualChunks(body.question, candidatePool);
  const requiredEvidence = requiresStrictEvidence(body.question) ? minEvidenceChunks : Math.max(1, minEvidenceChunks - 1);
  if (selectedChunks.length < requiredEvidence) {
    return unavailable("insufficient_evidence");
  }

  const chosenChunk = selectedChunks[0];
  if (!hasQueryTermOverlap(body.question, chosenChunk.chunk_text)) {
    metrics.gabe_wrong_manual_total += 1;
    return unavailable("semantic_mismatch");
  }

  try {
    const answer = await callGroq([chosenChunk], body.question);
    validateAnswer(answer, [chosenChunk]);
    return answer;
  } catch (err) {
    request.log.error({ err }, "GABE answer validation failed; falling back to extractive answer");
    const fallback = buildExtractiveAnswer(body.question, chosenChunk);
    if (fallback) return fallback;
    return unavailable("validation_failed");
  }
});

function unavailable(reason: string) {
  if (reason === "validation_failed") metrics.gabe_missing_citation_total += 1;
  return {
    answer: "This information is not available in verified manufacturer documentation.",
    source_type: "none" as const,
    confidence: 0,
    no_answer_reason: reason
  };
}

function buildExtractiveAnswer(question: string, chunk: RetrievedChunk | undefined) {
  if (!chunk || chunk.source_type !== "manual") return null;
  const quote = extractQuote(question, chunk.chunk_text);
  if (!quote) return null;
  return {
    answer: `Manual states: "${quote}"`,
    source_type: "manual" as const,
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

  const pick = sentences.find((s) => keywords.length > 0 && keywords.some((k) => s.toLowerCase().includes(k)))
    ?? sentences[0]
    ?? text;

  const words = pick.split(/\s+/).slice(0, 25);
  return words.join(" ");
}

function selectDeterministicManualChunks(question: string, candidates: RetrievedChunk[]) {
  if (candidates.length === 0) return [];

  const { brandHints, tokens } = extractQuestionHints(question);
  const groups = new Map<string, RetrievedChunk[]>();
  for (const c of candidates) {
    const key = `${c.manufacturer}|${c.model}|${c.manual_title}|${c.source_url}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  const scored = Array.from(groups.entries()).map(([key, chunks]) => {
    const sorted = [...chunks].sort((a, b) => b.score - a.score);
    const top = sorted[0]?.score ?? 0;
    const avgTop3 = sorted.slice(0, 3).reduce((s, x) => s + x.score, 0) / Math.min(3, sorted.length);
    const hay = `${chunks[0].manufacturer} ${chunks[0].model} ${chunks[0].manual_title}`.toLowerCase();
    const brandBonus = brandHints.some((b) => hay.includes(b)) ? 0.06 : 0;
    const tokenHits = tokens.filter((t) => t.length > 2 && hay.includes(t)).length;
    const tokenBonus = Math.min(0.09, tokenHits * 0.01);
    const installBonus = /installation manual/i.test(chunks[0].manual_title) ? 0.02 : 0;
    const groupScore = top * 0.7 + avgTop3 * 0.3 + brandBonus + tokenBonus + installBonus;
    return { key, chunks: sorted, groupScore };
  }).sort((a, b) => b.groupScore - a.groupScore);

  const best = scored[0];
  const second = scored[1];
  if (second && (best.groupScore - second.groupScore) < manualSelectionMinMargin) {
    const bestTop = best.chunks[0];
    const secondTop = second.chunks[0];
    if (bestTop && secondTop && bestTop.score < 0.8 && secondTop.score > 0.72) return [];
  }

  return best.chunks.slice(0, 3);
}

function applyKeywordBoost(question: string, results: RetrievedChunk[]) {
  const q = question.toLowerCase();
  const keywords: string[] = [];
  if (q.includes("outside air") || q.includes("combustion air") || q.includes("air intake") || q.includes("oak")) {
    keywords.push("outside air", "combustion air", "air intake", "outside combustion", "oak", "outside combustion air");
  }
  if (keywords.length === 0) return results;

  return results.map((r) => {
    const text = r.chunk_text.toLowerCase();
    const hit = keywords.some((k) => text.includes(k));
    if (!hit) return r;

    let bonus = 0.08;
    if (
      text.includes("air intake installation") ||
      text.includes("requires an air intake") ||
      text.includes("combustion air")
    ) {
      bonus += 0.18;
    }
    return { ...r, score: Math.min(1, r.score + bonus) };
  });
}

function rankAirChunk(chunk: RetrievedChunk) {
  const text = chunk.chunk_text.toLowerCase();
  let score = 0;
  if (text.includes("air intake installation")) score += 3;
  if (text.includes("air intake locations")) score += 2;
  if (text.includes("air intake collar")) score += 2;
  if (text.includes("combustion air")) score += 2;
  if (text.includes("requires")) score += 2;
  return score;
}

function fuseHybridResults(vectorResults: RetrievedChunk[], keywordResults: RetrievedChunk[]) {
  const k = 60;
  const scoreMap = new Map<string, RetrievedChunk & { _rrf: number }>();

  const add = (r: RetrievedChunk, rank: number) => {
    const key = `${r.source_url}|${r.page_number}|${r.manual_title}`;
    const existing = scoreMap.get(key);
    const addScore = 1 / (k + rank + 1);
    if (existing) {
      existing._rrf += addScore;
    } else {
      scoreMap.set(key, { ...r, _rrf: addScore });
    }
  };

  vectorResults.forEach((r, idx) => add(r, idx));
  keywordResults.forEach((r, idx) => add(r, idx));

  return Array.from(scoreMap.values())
    .sort((a, b) => b._rrf - a._rrf)
    .map(({ _rrf, ...rest }) => rest);
}

function applyManualHintFilter(question: string, results: RetrievedChunk[]) {
  const { q, brandHints, tokens } = extractQuestionHints(question);

  const stop = new Set([
    "does", "the", "and", "allow", "outside", "combustion", "air", "kit", "kits",
    "use", "can", "for", "with", "manual", "require", "required", "need", "needs",
    "installation", "owner", "owners", "install", "page"
  ]);

  const modelTokens = tokens.filter((t) => !stop.has(t) && !brandHints.includes(t));
  const numericTokens = modelTokens.filter((t) => /^\d+$/.test(t));
  const technical = isTechnicalQuestion(q);

  const scored = results.map((r) => {
    const hay = `${r.manual_title} ${r.manufacturer} ${r.model}`.toLowerCase();
    const brandHit = brandHints.length === 0 ? 0 : brandHints.filter((b) => hay.includes(b)).length;
    const modelHit = modelTokens.filter((t) => hay.includes(t)).length;
    const hitCount = brandHit + modelHit;
    return { r, hitCount, brandHit, modelHit };
  });

  if (technical) {
    const noFlyers = scored.filter((s) => !/flyer|single page/.test(s.r.manual_title.toLowerCase()));
    if (noFlyers.length > 0) scored.splice(0, scored.length, ...noFlyers);
  }

  if (modelTokens.length > 0) {
    const modelMatches = scored.filter((s) => {
      if (s.modelHit < 2) return false;
      if (numericTokens.length === 0) return true;
      const hay = `${s.r.manual_title} ${s.r.manufacturer} ${s.r.model}`.toLowerCase();
      return numericTokens.some((t) => hay.includes(t));
    });
    if (modelMatches.length > 0) return { filtered: modelMatches.map((s) => s.r) };
  }

  if (brandHints.length > 0) {
    const brandMatches = scored.filter((s) => s.brandHit > 0);
    if (brandMatches.length > 0) {
      const preferred = brandMatches.filter((s) => s.modelHit >= 2).map((s) => s.r);
      return { filtered: preferred.length > 0 ? preferred : brandMatches.map((s) => s.r) };
    }
    return { filtered: [] };
  }

  const preferred = scored.filter((s) => s.hitCount >= 2).map((s) => s.r);
  if (preferred.length > 0) return { filtered: preferred };

  return { filtered: results };
}

function extractQuestionHints(question: string) {
  const q = question.toLowerCase();
  const brandHints = ["fpx", "lopi", "majestic", "monessen", "travis"].filter((b) => q.includes(b));
  const tokens = q
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .filter((t) => t.length >= 2);
  const hasBrandOrModel = brandHints.length > 0 || tokens.some((t) => /^\d+$/.test(t));
  return { q, brandHints, tokens, hasBrandOrModel };
}

function isTechnicalQuestion(q: string) {
  const technicalTerms = [
    "outside air", "combustion air", "air intake", "oak", "vent", "venting",
    "clearance", "install", "installation", "requirements", "required",
    "manual", "page", "spec", "specs", "pipe", "chimney", "service"
  ];
  return technicalTerms.some((t) => q.includes(t));
}

function buildKeywordTerms(question: string) {
  const q = question.toLowerCase();
  const terms = new Set<string>();
  const airTerms = ["outside air", "combustion air", "air intake", "outside combustion air", "oak"];
  airTerms.forEach((t) => {
    if (q.includes(t)) terms.add(t);
  });

  const { brandHints, tokens } = extractQuestionHints(question);
  brandHints.forEach((b) => terms.add(b));
  tokens.forEach((t) => {
    if (t.length >= 3) terms.add(t);
  });

  return Array.from(terms);
}

function extractIntentTerms(question: string) {
  const q = question.toLowerCase();
  const terms = [
    "outside air", "combustion air", "air intake", "oak",
    "vent", "venting", "chimney", "clearance", "pressure", "manifold", "hearth", "floor protection", "gas inlet"
  ];
  return terms.filter((t) => q.includes(t));
}

function applyTechnicalFilter(question: string, results: RetrievedChunk[]) {
  const q = question.toLowerCase();
  if (!isTechnicalQuestion(q)) return { filtered: results };

  const airKeywords = ["outside air", "combustion air", "air intake", "oak", "outside combustion air"];
  const keywords = [...airKeywords, "vent", "venting", "chimney", "clearance", "install", "installation", "service", "pressure", "manifold", "hearth", "floor protection", "gas inlet"];

  const prefersInstall =
    q.includes("install") ||
    q.includes("installation") ||
    q.includes("requirements") ||
    q.includes("combustion air") ||
    q.includes("outside air") ||
    q.includes("air intake") ||
    q.includes("oak");

  let filtered = results.filter((r) => r.page_number > 1 || r.chunk_text.length > 300);

  if (prefersInstall) {
    const installOnly = filtered.filter((r) =>
      r.doc_type === "installation" || /installation manual/i.test(r.manual_title)
    );
    if (installOnly.length > 0) filtered = installOnly;
  }

  const requiresAir = airKeywords.some((k) => q.includes(k));
  const intents = extractIntentTerms(question);
  const keywordHits = filtered.filter((r) => {
    const text = r.chunk_text.toLowerCase();
    if (requiresAir) {
      if (!(text.includes("air intake") || text.includes("combustion air") || text.includes("outside combustion"))) return false;
      if (text.includes("air intake parts")) return false;
      return true;
    }
    if (intents.length > 0) {
      return intents.some((k) => text.includes(k));
    }
    return keywords.some((k) => text.includes(k));
  });

  if (keywordHits.length === 0) return { filtered: [] };

  if (requiresAir) {
    filtered = keywordHits
      .map((r) => ({ r, score: rankAirChunk(r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x) => x.r);
  } else {
    const sectionHits = keywordHits.filter((r) => (r.section_title || "").toLowerCase().includes("air intake"));
    filtered = sectionHits.length > 0 ? sectionHits : keywordHits;
  }

  return { filtered };
}

function requiresStrictEvidence(question: string) {
  const q = question.toLowerCase();
  return ["outside air", "combustion air", "air intake", "clearance", "pressure", "service"].some((t) => q.includes(t));
}

function hasQueryTermOverlap(question: string, chunkText: string) {
  const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "does", "can", "use", "what", "is", "are", "manual", "model"]);
  const qTerms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => t.length >= 3 && !stop.has(t));
  if (qTerms.length === 0) return true;

  const hay = chunkText.toLowerCase();
  const hits = qTerms.filter((t) => hay.includes(t)).length;
  if (hits < Math.min(2, qTerms.length)) return false;

  const intents = extractIntentTerms(question);
  if (intents.length === 0) return true;
  return intents.some((t) => hay.includes(t));
}

function inferDocType(title: string) {
  const t = title.toLowerCase();
  if (t.includes("installation manual") || t.includes("install manual")) return "installation";
  if (t.includes("owner") || t.includes("owner's") || t.includes("owners")) return "owner";
  if (t.includes("flyer") || t.includes("single page")) return "flyer";
  return "other";
}

app.listen({ port: Number(env.PORT), host: "0.0.0.0" });
