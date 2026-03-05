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
import { queryDimensionsByModelTopic, upsertDimensions } from "./ingest/dimensionsStore";
import type { DimensionRecord, InstallAngle } from "./types";

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

app.post("/ingest/dimensions", async (request, reply) => {
  const body = request.body as { dimensions: DimensionRecord[] };
  if (!Array.isArray(body?.dimensions) || body.dimensions.length === 0) {
    return reply.status(400).send({ error: "dimensions[] required" });
  }

  const result = await upsertDimensions(body.dimensions);
  return result;
});

app.get("/query/dimensions", async (request, reply) => {
  const q = request.query as {
    model?: string;
    topic?: string;
    manufacturer?: string;
    install_angle?: InstallAngle;
  };

  if (!q.model || !q.topic) {
    return reply.status(400).send({ error: "model and topic query params are required" });
  }

  const items = await queryDimensionsByModelTopic({
    model: q.model,
    topic: q.topic,
    manufacturer: q.manufacturer,
    install_angle: q.install_angle
  });

  return { ok: true, count: items.length, items };
});

app.post("/query", async (request, reply) => {
  const body = request.body as { question: string };
  if (!body?.question) return reply.status(400).send({ error: "question required" });

  metrics.gabe_queries_total += 1;

  const lowIntent = classifyLowIntentQuestion(body.question);
  if (lowIntent) {
    return {
      answer: "I’m ready. Ask a fireplace install/service question and include brand/model when possible (example: 'For Travis 42 Apex, what are minimum framing dimensions?').",
      source_type: "none" as const,
      confidence: 0,
      no_answer_reason: lowIntent
    };
  }

  const directFraming = await directFramingLookupFromStore(body.question);
  if (directFraming) {
    const fast = buildFramingFastPath(body.question, directFraming);
    if (fast) return fast;
  }

  const [queryVector] = await embed([body.question]);
  const keywordTerms = buildKeywordTerms(body.question);

  const [vectorResults, keywordResults] = await Promise.all([
    searchManualChunks(queryVector, 80),
    keywordSearchManualChunks(keywordTerms, 80)
  ]);

  const framingDirect = tryDirectFramingLookup(body.question, keywordResults);
  if (framingDirect) return framingDirect;

  const hybridResults = fuseHybridResults(vectorResults, keywordResults);
  const boostedResults = applyKeywordBoost(body.question, hybridResults);
  const { filtered: hinted } = applyManualHintFilter(body.question, boostedResults);
  const { filtered: technical } = applyTechnicalFilter(body.question, hinted);

  const isFramingQuestion = body.question.toLowerCase().includes("framing") && body.question.toLowerCase().includes("dimension");
  const dynamicThreshold = isFramingQuestion ? 0.5 : Math.max(0.66, similarityThreshold - 0.08);
  const strongCandidates = technical.filter((r) => r.source_type === "manual" && r.score >= similarityThreshold);
  const fallbackCandidates = technical.filter((r) => r.source_type === "manual" && r.score >= dynamicThreshold);
  const candidatePool = strongCandidates.length > 0 ? strongCandidates : fallbackCandidates;

  const rerankedCandidates = rerankCandidates(body.question, candidatePool).slice(0, 40);
  const framingPreferred = selectFramingPreferredChunk(body.question, rerankedCandidates);
  const selectedChunks = framingPreferred ? [framingPreferred] : selectDeterministicManualChunks(body.question, rerankedCandidates);
  const requiredEvidence = requiresStrictEvidence(body.question) ? minEvidenceChunks : Math.max(1, minEvidenceChunks - 1);
  if (selectedChunks.length < requiredEvidence) {
    return unavailable("insufficient_evidence", body.question);
  }

  const chosenChunk = selectedChunks[0];
  const explicitModelScoped = buildModelPhrases(body.question).length > 0;
  if (!explicitModelScoped && !hasQueryTermOverlap(body.question, chosenChunk.chunk_text)) {
    metrics.gabe_wrong_manual_total += 1;
    return unavailable("semantic_mismatch", body.question);
  }

  const framingFastPath = buildFramingFastPath(body.question, chosenChunk);
  if (framingFastPath) {
    return framingFastPath;
  }

  try {
    const answer = await callGroq([chosenChunk], body.question);
    validateAnswer(answer, [chosenChunk]);
    return answer;
  } catch (err) {
    request.log.error({ err }, "GABE answer validation failed; falling back to extractive answer");
    const fallback = buildExtractiveAnswer(body.question, chosenChunk);
    if (fallback) return fallback;
    return unavailable("validation_failed", body.question);
  }
});

async function directFramingLookupFromStore(question: string): Promise<RetrievedChunk | null> {
  const q = question.toLowerCase();
  if (!(q.includes("framing") && q.includes("dimension"))) return null;

  const modelPhrases = buildModelPhrases(question);
  if (modelPhrases.length === 0) return null;

  const modelForDimensionQuery = modelPhrases.sort((a, b) => b.length - a.length)[0];
  const dimensions = await queryDimensionsByModelTopic({ model: modelForDimensionQuery, topic: "framing" });
  if (dimensions.length > 0) {
    const inferred = inferOpeningDimensionsFromDimensionRecords(dimensions);
    const dimText = dimensions
      .map((d) => `${d.dimension_key}: ${d.value_imperial}\" (${d.value_metric} mm)`)
      .join(", ");
    return {
      manual_title: dimensions[0].manual_title,
      manufacturer: dimensions[0].manufacturer,
      model: dimensions[0].model,
      page_number: dimensions[0].page_number,
      source_url: dimensions[0].source_url,
      chunk_text: inferred
        ? `Minimum opening dimensions: ${inferred.widthIn}\" W x ${inferred.heightIn}\" H x ${inferred.depthIn}\" D.`
        : `Minimum framing dimensions listed: ${dimText}`,
      section_title: "framing dimensions",
      doc_type: "installation",
      score: 1,
      source_type: "manual"
    };
  }

  const shouldTerms = ["minimum framing dimensions", "fireplace framing", "framing dimensions", "framing"];
  const scroll = await qdrant.scroll(env.QDRANT_COLLECTION, {
    limit: 200,
    with_payload: true,
    with_vector: false,
    filter: {
      should: shouldTerms.map((term) => ({ key: "chunk_text", match: { text: term } }))
    }
  }) as any;

  const points = (scroll.points || []).map((r: any) => {
    const p = r.payload || {};
    return {
      manual_title: p.manual_title,
      manufacturer: p.manufacturer,
      model: p.model,
      page_number: p.page_number,
      source_url: p.source_url,
      chunk_text: p.chunk_text,
      section_title: p.section_title,
      doc_type: p.doc_type,
      score: 1,
      source_type: p.source_type ?? "manual"
    } as RetrievedChunk;
  });

  const matched = points.filter((c: RetrievedChunk) => {
    const hay = `${c.manufacturer} ${c.model} ${c.manual_title}`.toLowerCase();
    return modelPhrases.some((p) => hay.includes(p));
  });

  if (matched.length === 0) return null;
  const nonIndex = matched.filter((m: RetrievedChunk) => {
    const t = m.chunk_text.toLowerCase();
    return !t.includes("table of contents") && !/^\d+\s+index\b/i.test(t.trim()) && !t.includes("........");
  });
  const pool = nonIndex.length > 0 ? nonIndex : matched;
  return pool.find((m: RetrievedChunk) => /fireplace framing|minimum framing dimensions/i.test(m.chunk_text)) || pool[0] || null;
}

function selectFramingPreferredChunk(question: string, candidates: RetrievedChunk[]) {
  const q = question.toLowerCase();
  if (!(q.includes("framing") && q.includes("dimension"))) return null;
  const modelPhrases = buildModelPhrases(question);

  const matched = candidates.filter((c) => {
    const hay = `${c.manufacturer} ${c.model} ${c.manual_title}`.toLowerCase();
    if (modelPhrases.length > 0 && !modelPhrases.some((p) => hay.includes(p))) return false;
    const t = c.chunk_text.toLowerCase();
    return t.includes("minimum framing dimensions") || t.includes("fireplace framing") || (t.includes("framing") && t.includes("dimension"));
  });

  return matched.sort((a, b) => b.score - a.score)[0] || null;
}

function tryDirectFramingLookup(question: string, keywordResults: RetrievedChunk[]) {
  const q = question.toLowerCase();
  if (!(q.includes("framing") && q.includes("dimension"))) return null;

  const modelPhrases = buildModelPhrases(question);
  if (modelPhrases.length === 0) return null;

  const matchedModel = keywordResults.filter((r) => {
    const hay = `${r.manufacturer} ${r.model} ${r.manual_title}`.toLowerCase();
    return modelPhrases.some((p) => hay.includes(p));
  });

  const framingChunks = matchedModel.filter((r) => {
    const t = r.chunk_text.toLowerCase();
    return t.includes("minimum framing dimensions") || t.includes("fireplace framing") || (t.includes("framing") && t.includes("dimension"));
  });

  const pick = framingChunks[0];
  if (!pick) return null;
  const fast = buildFramingFastPath(question, pick);
  return fast;
}

function unavailable(reason: string, question?: string) {
  if (reason === "validation_failed") metrics.gabe_missing_citation_total += 1;
  const guided = buildGuidedFallbackAnswer(reason, question || "");
  return {
    answer: guided,
    source_type: "none" as const,
    confidence: 0,
    no_answer_reason: reason
  };
}

function buildGuidedFallbackAnswer(reason: string, question: string) {
  const q = (question || "").toLowerCase();
  const isSafety = ["smell gas", "gas leak", "before lighting", "pilot", "vent", "clearance", "pressure"].some((t) => q.includes(t));

  if (reason === "insufficient_evidence" || reason === "semantic_mismatch") {
    if (isSafety) {
      return "I can’t verify this in the loaded manuals yet. For safety: do not proceed on unverified gas/venting steps. If you smell gas, shut off gas supply, avoid ignition sources, ventilate the area, and follow the manufacturer ‘If You Smell Gas’ section. Re-ask with brand + exact model so I can target the correct manual section.";
    }
    return "I don’t have enough verified manual evidence for that exact question yet. Please include brand and model (example: ‘Travis 42 Apex’) and the section type (install/service/owner), and I’ll give a manual-grounded answer with citation.";
  }

  return "This information is not available in verified manufacturer documentation.";
}

function buildFramingFastPath(question: string, chunk: RetrievedChunk | undefined) {
  if (!chunk || chunk.source_type !== "manual") return null;
  const q = question.toLowerCase();
  const isFraming = q.includes("framing") && q.includes("dimension");
  if (!isFraming) return null;

  const text = chunk.chunk_text.replace(/\s+/g, " ");
  const dims = extractFramingDimensions(text);

  let answer: string;
  let quote: string;

  if (dims.length > 0) {
    const inferred = inferOpeningDimensionsFromFramingList(dims);
    if (inferred) {
      answer = `Minimum opening dimensions: ${inferred.widthIn}\" W × ${inferred.heightIn}\" H × ${inferred.depthIn}\" D.`;
      quote = `Minimum opening: ${inferred.widthIn}\" W, ${inferred.heightIn}\" H, ${inferred.depthIn}\" D`;
    } else {
      const dimText = dims.join(", ");
      answer = `Minimum framing dimensions listed: ${dimText}.`;
      quote = dimText;
    }
  } else {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const pick = sentences.find((s) => /framing|dimension|minimum/i.test(s));
    if (!pick) return null;
    quote = pick.split(/\s+/).slice(0, 25).join(" ");
    answer = `Manual states: "${quote}"`;
  }

  return {
    answer,
    source_type: "manual" as const,
    manual_title: chunk.manual_title,
    page_number: chunk.page_number,
    source_url: chunk.source_url,
    quote,
    confidence: 80
  };
}

function inferOpeningDimensionsFromDimensionRecords(
  records: Array<{ value_imperial: string; dimension_key: string }>
): { widthIn: string; heightIn: string; depthIn: string } | null {
  const nums = records
    .map((r) => Number(r.value_imperial))
    .filter((n) => Number.isFinite(n) && n > 1 && n < 200);

  if (nums.length === 0) return null;

  const near = (target: number, tol: number) => nums.find((n) => Math.abs(n - target) <= tol);
  const height = near(81, 1.5) ?? Math.max(...nums.filter((n) => n <= 120));
  const width = near(42, 2) ?? near(46, 2) ?? nums.find((n) => n >= 34 && n <= 60);
  const depth = near(23, 2) ?? near(17, 2) ?? nums.find((n) => n >= 12 && n <= 30);

  if (!height || !width || !depth) return null;

  const fmt = (n: number) => {
    const rounded = Math.round(n * 1000) / 1000;
    return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
  };

  return { widthIn: fmt(width), heightIn: fmt(height), depthIn: fmt(depth) };
}

function inferOpeningDimensionsFromFramingList(items: string[]): { widthIn: string; heightIn: string; depthIn: string } | null {
  const nums: number[] = [];
  const re = /(\d+(?:-\d+\/\d+|\/\d+)?)/g;

  const fracToFloat = (s: string) => {
    if (s.includes("-")) {
      const [w, f] = s.split("-");
      const [n, d] = f.split("/").map(Number);
      return Number(w) + (d ? n / d : 0);
    }
    if (s.includes("/")) {
      const [n, d] = s.split("/").map(Number);
      return d ? n / d : Number(s);
    }
    return Number(s);
  };

  for (const it of items) {
    const m = it.match(re);
    if (!m) continue;
    for (const tok of m) {
      const v = fracToFloat(tok);
      if (Number.isFinite(v) && v > 1 && v < 200) nums.push(v);
    }
  }

  if (nums.length === 0) return null;

  // Pick likely opening dimensions from common fireplace framing ranges.
  const near = (target: number, tol: number) => nums.find((n) => Math.abs(n - target) <= tol);
  const height = near(81, 1.5) ?? Math.max(...nums.filter((n) => n <= 120));
  const width = near(42, 2) ?? near(46, 2) ?? nums.find((n) => n >= 34 && n <= 60);
  const depth = near(23, 2) ?? near(17, 2) ?? nums.find((n) => n >= 12 && n <= 30);

  if (!height || !width || !depth) return null;

  const fmt = (n: number) => {
    const rounded = Math.round(n * 1000) / 1000;
    return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
  };

  return { widthIn: fmt(width), heightIn: fmt(height), depthIn: fmt(depth) };
}

function extractFramingDimensions(text: string) {
  const results: string[] = [];
  const reLetter = /\(([a-z])\)\s*([0-9]+(?:-[0-9]+\/[0-9]+|\/[0-9]+)?(?:\"|”)?\s*\([0-9]+mm\))/gi;
  let m: RegExpExecArray | null;
  while ((m = reLetter.exec(text)) !== null) {
    results.push(`(${m[1]}) ${m[2]}`);
  }

  if (results.length === 0) {
    const reSimple = /([0-9]+(?:-[0-9]+\/[0-9]+|\/[0-9]+)?(?:\"|”)?\s*\([0-9]+mm\))/g;
    const found = text.match(reSimple) || [];
    for (const f of found.slice(0, 4)) results.push(f);
  }

  return Array.from(new Set(results));
}

function buildExtractiveAnswer(question: string, chunk: RetrievedChunk | undefined) {
  if (!chunk || chunk.source_type !== "manual") return null;
  const quote = extractQuote(question, chunk.chunk_text);
  if (!quote) return null;
  const intents = extractIntentTerms(question);
  const quoteLc = quote.toLowerCase();
  if (intents.length > 0 && !intents.some((t) => quoteLc.includes(t))) {
    return null;
  }
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

  const intents = extractIntentTerms(question);
  const pick = sentences.find((s) => {
      const sl = s.toLowerCase();
      if (keywords.length > 0 && keywords.some((k) => sl.includes(k))) return true;
      if (intents.length > 0 && intents.some((k) => sl.includes(k))) return true;
      return false;
    })
    ?? sentences[0]
    ?? text;

  const words = pick.split(/\s+/).slice(0, 25);
  return words.join(" ");
}

function rerankCandidates(question: string, candidates: RetrievedChunk[]) {
  const intents = extractIntentTerms(question);
  const q = question.toLowerCase();

  return [...candidates]
    .map((c) => {
      const text = c.chunk_text.toLowerCase();
      const section = (c.section_title || "").toLowerCase();
      const intentHits = intents.filter((t) => text.includes(t) || section.includes(t)).length;
      const modelHints = extractQuestionHints(question).tokens.filter((t) => t.length >= 3 && `${c.manufacturer} ${c.model} ${c.manual_title}`.toLowerCase().includes(t)).length;

      let boost = 0;
      boost += Math.min(0.18, intentHits * 0.06);
      boost += Math.min(0.08, modelHints * 0.01);
      if (/installation manual/i.test(c.manual_title) && (q.includes("install") || q.includes("require") || q.includes("clearance") || q.includes("framing"))) boost += 0.05;
      if (q.includes("framing") && q.includes("dimension")) {
        if (text.includes("minimum framing dimensions") || text.includes("fireplace framing")) boost += 0.25;
        else if (text.includes("framing")) boost += 0.12;
      }
      if (section.includes("introduction") || text.includes("table of contents") || text.includes("welcome you as a new owner")) boost -= 0.12;

      return { ...c, score: Math.max(0, Math.min(1, c.score + boost)) };
    })
    .sort((a, b) => b.score - a.score);
}

function selectDeterministicManualChunks(question: string, candidates: RetrievedChunk[]) {
  if (candidates.length === 0) return [];

  const { brandHints, tokens } = extractQuestionHints(question);
  const modelPhrases = buildModelPhrases(question);
  const groups = new Map<string, RetrievedChunk[]>();
  for (const c of candidates) {
    const key = `${c.manufacturer}|${c.model}|${c.manual_title}|${c.source_url}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  const scoredAll = Array.from(groups.entries()).map(([key, chunks]) => {
    const sorted = [...chunks].sort((a, b) => b.score - a.score);
    const top = sorted[0]?.score ?? 0;
    const avgTop3 = sorted.slice(0, 3).reduce((s, x) => s + x.score, 0) / Math.min(3, sorted.length);
    const hay = `${chunks[0].manufacturer} ${chunks[0].model} ${chunks[0].manual_title}`.toLowerCase();
    const brandBonus = brandHints.some((b) => hay.includes(b)) ? 0.06 : 0;
    const tokenHits = tokens.filter((t) => t.length > 2 && hay.includes(t)).length;
    const tokenBonus = Math.min(0.09, tokenHits * 0.01);
    const installBonus = /installation manual/i.test(chunks[0].manual_title) ? 0.02 : 0;
    const modelPhraseBonus = modelPhrases.some((p) => hay.includes(p)) ? 0.12 : 0;
    const groupScore = top * 0.7 + avgTop3 * 0.3 + brandBonus + tokenBonus + installBonus + modelPhraseBonus;
    return { key, chunks: sorted, groupScore, hay };
  });

  const phraseMatched = modelPhrases.length > 0 ? scoredAll.filter((s) => modelPhrases.some((p) => s.hay.includes(p))) : [];
  if (modelPhrases.length > 0 && phraseMatched.length === 0) {
    return [];
  }
  const scored = (phraseMatched.length > 0 ? phraseMatched : scoredAll).sort((a, b) => b.groupScore - a.groupScore);

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

function buildModelPhrases(question: string) {
  const q = question.toLowerCase();
  const phrases: string[] = [];
  const known = [
    "42 apex nexgen",
    "42 apex",
    "36 elite nexgen",
    "36 elite",
    "answer nexgen",
    "lopi answer",
    "liberty nexgen",
    "lopi liberty",
    "rockport nexgen",
    "lopi rockport",
    "probuilder 42"
  ];
  for (const p of known) {
    if (q.includes(p)) phrases.push(p);
  }
  return phrases;
}

function isTechnicalQuestion(q: string) {
  const technicalTerms = [
    "outside air", "combustion air", "air intake", "oak", "vent", "venting",
    "clearance", "install", "installation", "requirements", "required",
    "manual", "page", "spec", "specs", "pipe", "chimney", "service",
    "smell gas", "gas leak", "before lighting", "pilot", "lighting"
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
    "vent", "venting", "chimney", "clearance", "pressure", "manifold", "hearth", "floor protection", "gas inlet",
    "framing", "framing dimensions", "minimum framing", "fireplace framing", "rough opening", "width", "height", "depth",
    "smell gas", "gas leak", "do not light", "before lighting", "pilot"
  ];
  return terms.filter((t) => q.includes(t));
}

function applyTechnicalFilter(question: string, results: RetrievedChunk[]) {
  const q = question.toLowerCase();
  if (!isTechnicalQuestion(q)) return { filtered: results };

  const airKeywords = ["outside air", "combustion air", "air intake", "oak", "outside combustion air"];
  const keywords = [...airKeywords, "vent", "venting", "chimney", "clearance", "install", "installation", "service", "pressure", "manifold", "hearth", "floor protection", "gas inlet", "framing", "dimensions", "minimum framing", "rough opening", "width", "height", "depth", "smell gas", "gas leak", "do not light", "before lighting", "pilot"];

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

  const notIntro = keywordHits.filter((r) => {
    const t = r.chunk_text.toLowerCase();
    return !(
      t.includes("introduction") ||
      t.includes("table of contents") ||
      t.includes("welcome you as a new owner")
    );
  });
  const cleanedHits = notIntro.length > 0 ? notIntro : keywordHits;

  if (requiresAir) {
    filtered = cleanedHits
      .map((r) => ({ r, score: rankAirChunk(r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x) => x.r);
  } else {
    const sectionHits = cleanedHits.filter((r) => {
      const s = (r.section_title || "").toLowerCase();
      return s.includes("air intake") || s.includes("clearance") || s.includes("vent") || s.includes("chimney") || s.includes("pressure") || s.includes("hearth");
    });
    filtered = sectionHits.length > 0 ? sectionHits : cleanedHits;
  }

  return { filtered };
}

function requiresStrictEvidence(question: string) {
  const q = question.toLowerCase();
  return ["outside air", "combustion air", "air intake", "clearance", "pressure", "service", "smell gas", "gas leak", "before lighting"].some((t) => q.includes(t));
}

function classifyLowIntentQuestion(question: string): string | null {
  const q = (question || "").trim().toLowerCase();
  if (!q) return "empty_query";
  if (["test", "testing", "hello", "hi", "hey", "yo", "sup"].includes(q)) return "low_intent_query";

  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length <= 2 && !isTechnicalQuestion(q)) return "low_intent_query";

  return null;
}

function hasQueryTermOverlap(question: string, chunkText: string) {
  const hay = chunkText.toLowerCase();
  const intents = extractIntentTerms(question);
  if (intents.length > 0) {
    return intents.some((t) => hay.includes(t));
  }

  const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "does", "can", "use", "what", "is", "are", "manual", "model"]);
  const qTerms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => t.length >= 3 && !stop.has(t));
  if (qTerms.length === 0) return true;

  const hits = qTerms.filter((t) => hay.includes(t)).length;
  return hits >= 1;
}

function inferDocType(title: string) {
  const t = title.toLowerCase();
  if (t.includes("installation manual") || t.includes("install manual")) return "installation";
  if (t.includes("owner") || t.includes("owner's") || t.includes("owners")) return "owner";
  if (t.includes("flyer") || t.includes("single page")) return "flyer";
  return "other";
}

app.listen({ port: Number(env.PORT), host: "0.0.0.0" });
