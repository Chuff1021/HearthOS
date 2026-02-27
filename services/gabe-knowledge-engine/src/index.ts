import Fastify from "fastify";
import { env, similarityThreshold } from "./config";
import { embed } from "./embeddings";
import { extractPdfPages } from "./ingest/pdf";
import { chunkPages } from "./ingest/chunker";
import { ensureCollection, qdrant } from "./retrieval/qdrant";
import { keywordSearchManualChunks, searchManualChunks } from "./retrieval/search";
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
  const docType = inferDocType(body.manual_title);

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
      section_title: c.section_title,
      doc_type: docType,
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
  const keywordTerms = buildKeywordTerms(body.question);
  const [vectorResults, keywordResults] = await Promise.all([
    searchManualChunks(queryVector, 50),
    keywordSearchManualChunks(keywordTerms, 50)
  ]);
  const hybridResults = fuseHybridResults(vectorResults, keywordResults);
  const boostedManualResults = applyKeywordBoost(body.question, hybridResults);
  const { filtered: hintedManualResults } = applyManualHintFilter(body.question, boostedManualResults);
  const { filtered: technicalFiltered } = applyTechnicalFilter(body.question, hintedManualResults);
  const manualMatches = technicalFiltered.filter((r) => r.score >= similarityThreshold);

  let selectedChunks: RetrievedChunk[] = [];
  if (manualMatches.length > 0) {
    selectedChunks = manualMatches
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  } else {
    // Fallback: still use top manual chunks even if below threshold
    if (technicalFiltered.length > 0) {
      selectedChunks = technicalFiltered
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    } else {
      const { hasBrandOrModel, q } = extractQuestionHints(body.question);
      if (hasBrandOrModel || isTechnicalQuestion(q)) {
        selectedChunks = [];
      } else {
        const webResults = await braveSearch(body.question, 5);
        for (const result of webResults) {
          try {
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
          } catch (err) {
            request.log.warn({ err, url: result.url }, "Web fetch failed, skipping");
          }
        }

        selectedChunks = selectedChunks.slice(0, 3);
      }
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
  const q = question.toLowerCase();
  const requiresAir = ["outside air", "combustion air", "air intake", "oak"].some((t) => q.includes(t));
  return {
    answer: requiresAir
      ? `Yes. The manual identifies an air intake for this fireplace. "${quote}"`
      : `Manual states: "${quote}"`,
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
    if (noFlyers.length > 0) {
      scored.splice(0, scored.length, ...noFlyers);
    }
  }

  if (modelTokens.length > 0) {
    const modelMatches = scored.filter((s) => {
      if (s.modelHit < 2) return false;
      if (numericTokens.length === 0) return true;
      const hay = `${s.r.manual_title} ${s.r.manufacturer} ${s.r.model}`.toLowerCase();
      return numericTokens.some((t) => hay.includes(t));
    });
    if (modelMatches.length > 0) {
      return { filtered: modelMatches.map((s) => s.r) };
    }
  }

  // If brand is specified and any results match the brand, only keep brand matches.
  if (brandHints.length > 0) {
    const brandMatches = scored.filter((s) => s.brandHit > 0);
    if (brandMatches.length > 0) {
      const preferred = brandMatches.filter((s) => s.modelHit >= 2).map((s) => s.r);
      return { filtered: preferred.length > 0 ? preferred : brandMatches.map((s) => s.r) };
    }
    return { filtered: [] };
  }

  const preferred = scored.filter((s) => s.hitCount >= 2).map((s) => s.r);
  if (preferred.length > 0) {
    return { filtered: preferred };
  }

  return { filtered: results };
}

function extractQuestionHints(question: string) {
  const q = question.toLowerCase();
  const brandHints = ["fpx", "lopi", "majestic", "monessen"].filter((b) => q.includes(b));
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
    "manual", "page", "spec", "specs", "pipe", "chimney"
  ];
  return technicalTerms.some((t) => q.includes(t));
}

function buildKeywordTerms(question: string) {
  const q = question.toLowerCase();
  const terms = new Set<string>();
  const airTerms = ["outside air", "combustion air", "air intake", "oak"];
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

function applyTechnicalFilter(question: string, results: RetrievedChunk[]) {
  const q = question.toLowerCase();
  if (!isTechnicalQuestion(q)) return { filtered: results };

  const airKeywords = ["outside air", "combustion air", "air intake", "oak"];
  const keywords = [
    ...airKeywords,
    "vent", "venting", "chimney", "clearance", "install", "installation"
  ];

  const prefersInstall =
    q.includes("install") ||
    q.includes("installation") ||
    q.includes("requirements") ||
    q.includes("combustion air") ||
    q.includes("outside air") ||
    q.includes("air intake") ||
    q.includes("oak");

  let filtered = results;

  // Drop cover-page style chunks for technical queries.
  filtered = filtered.filter((r) => r.page_number > 1 || r.chunk_text.length > 300);

  // Prefer Installation Manual over Owner's Manual for install/requirements.
  if (prefersInstall) {
    const installOnly = filtered.filter((r) =>
      r.doc_type === "installation" || /installation manual/i.test(r.manual_title)
    );
    if (installOnly.length > 0) filtered = installOnly;
  }

  // Require at least one keyword hit when asking technical questions.
  const requiresAir = airKeywords.some((k) => q.includes(k));
  const keywordHits = filtered.filter((r) => {
    const text = r.chunk_text.toLowerCase();
    if (requiresAir) {
      if (!text.includes("air intake")) return false;
      if (text.includes("air intake parts")) return false;
      return true;
    }
    return keywords.some((k) => text.includes(k));
  });
  if (keywordHits.length > 0) {
    if (requiresAir) {
      filtered = keywordHits
        .map((r) => ({ r, score: rankAirChunk(r) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((x) => x.r);
    } else {
      const sectionHits = keywordHits.filter((r) =>
        (r.section_title || "").toLowerCase().includes("air intake")
      );
      filtered = sectionHits.length > 0 ? sectionHits : keywordHits;
    }
  } else {
    return { filtered: [] };
  }

  return { filtered };
}

function inferDocType(title: string) {
  const t = title.toLowerCase();
  if (t.includes("installation manual") || t.includes("install manual")) return "installation";
  if (t.includes("owner") || t.includes("owner's") || t.includes("owners")) return "owner";
  if (t.includes("flyer") || t.includes("single page")) return "flyer";
  return "other";
}

app.listen({ port: Number(env.PORT), host: "0.0.0.0" });
