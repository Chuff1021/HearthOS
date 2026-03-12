"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const config_1 = require("./config");
const embeddings_1 = require("./embeddings");
const pdf_1 = require("./ingest/pdf");
const chunker_1 = require("./ingest/chunker");
const qdrant_1 = require("./retrieval/qdrant");
const search_1 = require("./retrieval/search");
const groq_1 = require("./llm/groq");
const ids_1 = require("./ingest/ids");
const retry_1 = require("./ingest/retry");
const dimensionsStore_1 = require("./ingest/dimensionsStore");
const web_1 = require("./retrieval/web");
const modelDetector_1 = require("./swarm/modelDetector");
const intentClassifier_1 = require("./swarm/intentClassifier");
const modelResolver_1 = require("./swarm/modelResolver");
const manualRanker_1 = require("./swarm/manualRanker");
const sectionRouter_1 = require("./swarm/sectionRouter");
const validatorAgent_1 = require("./swarm/validatorAgent");
const selfRefiner_1 = require("./swarm/selfRefiner");
const evidenceBuilder_1 = require("./swarm/evidenceBuilder");
const responseComposer_1 = require("./swarm/responseComposer");
const runMetadata_1 = require("./swarm/runMetadata");
const partAliases_1 = require("./swarm/partAliases");
const ventingEngine_1 = require("./swarm/ventingEngine");
const wiringEngine_1 = require("./swarm/wiringEngine");
const partsEngine_1 = require("./swarm/partsEngine");
const complianceEngine_1 = require("./swarm/complianceEngine");
const app = (0, fastify_1.default)({ logger: { level: config_1.env.LOG_LEVEL } });
app.addHook('onSend', async (_req, _reply, payload) => {
    try {
        const text = typeof payload === 'string' ? payload : payload?.toString?.() || '';
        if (!text || !text.trim().startsWith('{'))
            return payload;
        const obj = JSON.parse(text);
        obj.engine_build_id = process.env.ENGINE_BUILD_ID || 'unknown';
        obj.engine_commit_sha = process.env.ENGINE_COMMIT_SHA || 'unknown';
        obj.engine_runtime_name = process.env.ENGINE_RUNTIME_NAME || 'gabe-knowledge-engine';
        obj.vent_template_active = String(process.env.VENT_TEMPLATE_ACTIVE || 'false').toLowerCase() === 'true';
        return JSON.stringify(obj);
    }
    catch {
        return payload;
    }
});
const metrics = {
    gabe_queries_total: 0,
    gabe_wrong_manual_total: 0,
    gabe_missing_citation_total: 0
};
app.get("/health", async () => ({ ok: true }));
app.get("/ops/diagram-confidence", async () => {
    try {
        const res = await qdrant_1.qdrant.scroll(config_1.env.QDRANT_DIAGRAM_COLLECTION, {
            limit: 200,
            with_payload: true,
            with_vector: false,
        });
        const points = res.points || [];
        const total = points.length;
        let confident = 0;
        for (const p of points) {
            const sd = p?.payload?.structured_data || {};
            const measurements = Array.isArray(sd.measurements) ? sd.measurements : [];
            if (measurements.length > 0)
                confident += 1;
        }
        const score = total > 0 ? Number(((confident / total) * 100).toFixed(1)) : 0;
        return { score, total };
    }
    catch {
        return { score: 0, total: 0 };
    }
});
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
    const body = request.body;
    if (!body?.file_path || !body.manual_title || !body.manufacturer || !body.model || !body.source_url) {
        return reply.status(400).send({ error: "file_path, manual_title, manufacturer, model, source_url required" });
    }
    const pages = await (0, pdf_1.extractPdfPages)(body.file_path);
    const chunks = (0, chunker_1.chunkPages)(pages, 450, 750, 2);
    if (chunks.length === 0)
        return reply.status(400).send({ error: "no_extractable_text" });
    const embeddings = await (0, embeddings_1.embed)(chunks.map((c) => c.text));
    await (0, qdrant_1.ensureCollection)(embeddings[0].length);
    const docType = inferDocType(body.manual_title);
    const points = chunks.map((c, idx) => ({
        id: (0, ids_1.stableUuid)(`${body.source_url}|${c.page}|${c.text}`),
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
        await (0, retry_1.retryAsync)(() => qdrant_1.qdrant.upsert(config_1.env.QDRANT_COLLECTION, { wait: true, points: batch }), {
            maxRetries: 6,
            baseDelayMs: 1000,
            maxDelayMs: 20000,
            onRetry: (attempt, delayMs, err) => {
                request.log.warn({ err, attempt, delayMs }, "manual ingest upsert retry");
            }
        });
    }
    return { ok: true, chunks: points.length };
});
app.post("/ingest/diagrams", async (request, reply) => {
    const body = request.body;
    if (!Array.isArray(body?.diagrams) || body.diagrams.length === 0) {
        return reply.status(400).send({ error: "diagrams[] required" });
    }
    const texts = body.diagrams.map((d) => {
        const sd = JSON.stringify(d.structured_data || {});
        return `${d.brand} ${d.model} ${d.diagram_type} page ${d.page} ${sd} ${d.source_text || ""}`;
    });
    const vectors = await (0, embeddings_1.embed)(texts);
    await (0, qdrant_1.ensureCollection)(vectors[0].length, config_1.env.QDRANT_DIAGRAM_COLLECTION);
    const points = body.diagrams.map((d, i) => ({
        id: (0, ids_1.stableUuid)(`${d.manual_url}|${d.page}|${d.image_path}|${d.diagram_type}`),
        vector: vectors[i],
        payload: {
            brand: d.brand,
            manufacturer: d.brand,
            model: d.model,
            diagram_type: d.diagram_type,
            page: d.page,
            page_number: d.page,
            manual_url: d.manual_url,
            source_url: d.manual_url,
            image_path: d.image_path,
            structured_data: d.structured_data,
            text: texts[i],
            chunk_text: texts[i],
            section_title: d.diagram_type,
            doc_type: "diagram",
            source_type: "manual"
        }
    }));
    await qdrant_1.qdrant.upsert(config_1.env.QDRANT_DIAGRAM_COLLECTION, { wait: true, points });
    return { ok: true, diagrams: points.length };
});
app.post("/ingest/qa-memory", async (request, reply) => {
    const body = request.body;
    if (!Array.isArray(body?.entries) || body.entries.length === 0) {
        return reply.status(400).send({ error: "entries[] required" });
    }
    const texts = body.entries.map((e) => `${e.normalized_question || e.question}\n${e.answer}`);
    const vectors = await (0, embeddings_1.embed)(texts);
    await (0, qdrant_1.ensureCollection)(vectors[0].length, "fireplace_qa_memory");
    const points = body.entries.map((e, i) => ({
        id: (0, ids_1.stableUuid)(`${e.normalized_question || e.question}|${e.answer}`),
        vector: vectors[i],
        payload: {
            question: e.question,
            normalized_question: e.normalized_question || e.question,
            model: e.model || null,
            answer: e.answer,
            source_pages: e.source_pages || [],
            source_urls: e.source_urls || [],
            verified: !!e.verified,
            technician_notes: e.technician_notes || null,
            correction_status: e.correction_status || null,
            source_type: e.verified ? "manual" : "web",
        }
    }));
    await qdrant_1.qdrant.upsert("fireplace_qa_memory", { wait: true, points });
    return { ok: true, inserted: points.length };
});
app.post("/ingest/dimensions", async (request, reply) => {
    const body = request.body;
    if (!Array.isArray(body?.dimensions) || body.dimensions.length === 0) {
        return reply.status(400).send({ error: "dimensions[] required" });
    }
    const result = await (0, dimensionsStore_1.upsertDimensions)(body.dimensions);
    return result;
});
app.get("/query/dimensions", async (request, reply) => {
    const q = request.query;
    if (!q.model || !q.topic) {
        return reply.status(400).send({ error: "model and topic query params are required" });
    }
    const items = await (0, dimensionsStore_1.queryDimensionsByModelTopic)({
        model: q.model,
        topic: q.topic,
        manufacturer: q.manufacturer,
        install_angle: q.install_angle
    });
    return { ok: true, count: items.length, items };
});
function hardNone(note) {
    return {
        answer: "This information is not available in verified manufacturer documentation.",
        source_type: "none",
        confidence: 0,
        certainty: "Unverified",
        run_outcome: "refused_unverified",
        validator_notes: [note],
    };
}
function normalizeReasonCode(answer, rejectedReason) {
    const notes = Array.isArray(answer?.validator_notes) ? answer.validator_notes.map((x) => String(x)) : [];
    const noteBlob = `${notes.join("|")}|${String(rejectedReason || "")}`.toLowerCase();
    if (/missing_explicit|insufficient_explicit/.test(noteBlob))
        return "missing_explicit_support";
    if (/missing_fields|missing_structured|insufficient_structured/.test(noteBlob))
        return "missing_structured_fields";
    if (/semantic_mismatch|model_ambiguous|ambiguous/.test(noteBlob))
        return "model_ambiguous";
    if (/source_not_found|insufficient_evidence|no_sources/.test(noteBlob))
        return "source_not_found";
    return "source_not_found";
}
function normalizeRunOutcome(answer) {
    const sourceType = String(answer?.source_type || "none");
    const certainty = String(answer?.certainty || "Unverified");
    const notes = Array.isArray(answer?.validator_notes) ? answer.validator_notes.map((x) => String(x).toLowerCase()) : [];
    if (notes.some((n) => n.includes("handoff")))
        return "escalated_handoff";
    if (sourceType === "none")
        return "refused_unverified";
    if (sourceType === "manual" || sourceType === "web") {
        if (certainty === "Verified Exact")
            return "answered_verified";
        if (certainty === "Verified Partial" || certainty === "Interpreted")
            return "answered_partial";
    }
    return "source_evidence_missing";
}
function inferSelectedEngine(answer) {
    const notes = Array.isArray(answer?.validator_notes) ? answer.validator_notes.map((x) => String(x).toLowerCase()) : [];
    if (notes.some((n) => n.includes("parts_")))
        return "parts_engine";
    if (notes.some((n) => n.includes("wiring_")))
        return "wiring_engine";
    if (notes.some((n) => n.includes("vent") || n.includes("chimney")))
        return "venting_engine";
    if (notes.some((n) => n.includes("compliance_") || n.includes("code_")))
        return "compliance_engine";
    return "general_engine";
}
function enrichMetadata(answer, selectedEngine, rejectedReason, context) {
    const run_outcome = normalizeRunOutcome(answer);
    const source_evidence_status = answer?.source_type === "manual" || answer?.source_type === "web" ? "present" : "missing";
    const truth_audit_status = run_outcome === "refused_unverified" ? "not_applicable" : "validator_passed";
    const qr = context?.queryResolution;
    return {
        ...answer,
        selected_engine: selectedEngine || inferSelectedEngine(answer),
        run_outcome,
        refusal_reason: run_outcome === "refused_unverified" ? normalizeReasonCode(answer, rejectedReason) : undefined,
        source_evidence_status,
        truth_audit_status,
        validator_version: process.env.VALIDATOR_VERSION || "v1",
        resolved_manufacturer: qr?.manufacturer_candidate || null,
        resolved_model: qr?.model_candidate || null,
        resolved_model_confidence: qr?.confidence ?? null,
        resolved_intent: qr?.intent || null,
        preferred_manual_type: qr?.preferred_manual_type || null,
        alternatives_considered: context?.rankedManuals?.slice?.(0, 3) || [],
    };
}
async function finalizeThroughGate(params) {
    const verdict = (0, validatorAgent_1.validateOrReject)(params.answer, params.retrieved);
    const context = params.context || params.evidencePacket || {};
    if (verdict.ok) {
        const enriched = enrichMetadata(verdict.answer, params.selectedEngine || "general_engine", undefined, context);
        await (0, runMetadata_1.appendRunMetadata)({
            question: params.question,
            selected_engine: enriched.selected_engine,
            certainty: enriched.certainty,
            run_outcome: enriched.run_outcome,
            truth_audit_status: enriched.truth_audit_status,
            source_evidence_status: enriched.source_evidence_status,
            validator_version: enriched.validator_version,
            source_type: enriched.source_type,
            validator_notes: enriched.validator_notes || [],
            refusal_reason: enriched.refusal_reason,
            manual_title: enriched.manual_title,
            page_number: enriched.page_number,
            source_url: enriched.source_url,
            quote: enriched.quote,
            evidencePacket: params.evidencePacket,
        });
        const formatted = (0, responseComposer_1.composeValidatedResponse)(enriched);
        if (String(process.env.DIAGNOSTIC_RAW_ENABLED || 'false').toLowerCase() === 'true') {
            formatted.raw_internal_response = verdict.answer;
        }
        return formatted;
    }
    const safe = hardNone(`hard_gate_reject:${verdict.reason}`);
    const safeVerdict = (0, validatorAgent_1.validateOrReject)(safe, params.retrieved);
    if (safeVerdict.ok) {
        const enrichedSafe = enrichMetadata(safeVerdict.answer, params.selectedEngine || "general_engine", verdict.reason, context);
        await (0, runMetadata_1.appendRunMetadata)({
            question: params.question,
            selected_engine: enrichedSafe.selected_engine,
            certainty: enrichedSafe.certainty,
            run_outcome: enrichedSafe.run_outcome,
            truth_audit_status: enrichedSafe.truth_audit_status,
            source_evidence_status: enrichedSafe.source_evidence_status,
            validator_version: enrichedSafe.validator_version,
            source_type: enrichedSafe.source_type,
            validator_notes: enrichedSafe.validator_notes || [],
            refusal_reason: enrichedSafe.refusal_reason,
            manual_title: enrichedSafe.manual_title,
            page_number: enrichedSafe.page_number,
            source_url: enrichedSafe.source_url,
            quote: enrichedSafe.quote,
            evidencePacket: params.evidencePacket,
            blocked_unverified: true,
        });
        const formatted = (0, responseComposer_1.composeValidatedResponse)(enrichedSafe);
        if (String(process.env.DIAGNOSTIC_RAW_ENABLED || 'false').toLowerCase() === 'true') {
            formatted.raw_internal_response = safeVerdict.answer;
            formatted.rejected_answer = params.answer;
            formatted.rejected_reason = verdict.reason;
        }
        return formatted;
    }
    const fallback = enrichMetadata({ ...safe }, params.selectedEngine || "general_engine", verdict.reason, context);
    if (String(process.env.DIAGNOSTIC_RAW_ENABLED || 'false').toLowerCase() === 'true') {
        fallback.raw_internal_response = { ...safe };
        fallback.rejected_answer = params.answer;
        fallback.rejected_reason = verdict.reason;
    }
    return fallback;
}
app.post("/query", async (request, reply) => {
    const body = request.body;
    if (!body?.question)
        return reply.status(400).send({ error: "question required" });
    metrics.gabe_queries_total += 1;
    const modelDetection = (0, modelDetector_1.detectModel)(body.question);
    const intentClassification = (0, intentClassifier_1.classifyIntent)(body.question);
    const qLower = body.question.toLowerCase();
    const partsHint = /\b(part|replacement|diagram|callout|sku|item\s*#|thermopile|thermocouple|blower|gasket|pilot assembly|alias|revision|variant|family)\b/.test(qLower);
    const effectiveIntent = partsHint ? "replacement parts" : intentClassification.intent;
    const queryResolution = (0, modelResolver_1.resolveQuery)(body.question, effectiveIntent);
    const lowIntent = classifyLowIntentQuestion(body.question);
    if (lowIntent) {
        return await finalizeThroughGate({
            question: body.question,
            answer: {
                answer: "This information is not available in verified manufacturer documentation.",
                source_type: "none",
                confidence: 0,
                certainty: "Unverified",
                validator_notes: [lowIntent],
            },
            retrieved: [],
        });
    }
    const directFraming = await directFramingLookupFromStore(body.question);
    if (directFraming) {
        const fast = buildFramingFastPath(body.question, directFraming);
        if (fast)
            return await finalizeThroughGate({ question: body.question, answer: fast, retrieved: [directFraming] });
    }
    const webHints = await (0, web_1.searchWebHints)(body.question);
    const [queryVector] = await (0, embeddings_1.embed)([body.question]);
    const keywordTerms = buildKeywordTerms(body.question, [...webHints.terms, ...(0, partAliases_1.expandPartTerms)(body.question)]);
    const diagramIntents = new Set(["framing", "clearances", "venting", "electrical"]);
    const shouldUseDiagrams = diagramIntents.has(effectiveIntent);
    const [vectorResults, keywordResults, diagramVector, diagramKeyword, qaMemoryVector] = await Promise.all([
        (0, search_1.searchManualChunks)(queryVector, 80),
        (0, search_1.keywordSearchManualChunks)(keywordTerms, 80),
        shouldUseDiagrams ? (0, search_1.searchDiagramChunks)(queryVector, 40) : Promise.resolve([]),
        shouldUseDiagrams ? (0, search_1.keywordSearchDiagramChunks)(keywordTerms, 40) : Promise.resolve([]),
        (0, search_1.searchQaMemoryChunks)(queryVector, 10),
    ]);
    const framingDirect = tryDirectFramingLookup(body.question, keywordResults);
    if (framingDirect && directFraming)
        return await finalizeThroughGate({ question: body.question, answer: framingDirect, retrieved: [directFraming] });
    const hybridResults = fuseHybridResults([...vectorResults, ...diagramVector, ...qaMemoryVector], [...keywordResults, ...diagramKeyword, ...qaMemoryVector]);
    const boostedResults = applyKeywordBoost(body.question, hybridResults);
    const { filtered: hinted } = applyManualHintFilter(body.question, boostedResults);
    const { filtered: technical } = applyTechnicalFilter(body.question, hinted);
    const sectionRouted = (0, sectionRouter_1.routeBySection)(effectiveIntent, technical);
    const rankedManuals = (0, manualRanker_1.rankManuals)(sectionRouted.filter((r) => r.source_type === "manual"), queryResolution);
    const manualScoped = (0, manualRanker_1.filterToTopRankedManuals)(sectionRouted, rankedManuals, queryResolution.confidence >= 0.75 ? 2 : 4);
    const isFramingQuestion = body.question.toLowerCase().includes("framing") && body.question.toLowerCase().includes("dimension");
    const dynamicThreshold = isFramingQuestion ? 0.5 : Math.max(0.66, config_1.similarityThreshold - 0.08);
    const strongCandidates = manualScoped.filter((r) => r.source_type === "manual" && r.score >= config_1.similarityThreshold);
    const fallbackCandidates = manualScoped.filter((r) => r.source_type === "manual" && r.score >= dynamicThreshold);
    const candidatePool = strongCandidates.length > 0 ? strongCandidates : fallbackCandidates;
    const evidencePacket = (0, evidenceBuilder_1.buildEvidencePacket)({
        modelDetection,
        intent: { intent: effectiveIntent, subtopic: intentClassification.component },
        retrieved: manualScoped,
        qaMemory: qaMemoryVector,
        webHints: webHints.results,
    });
    evidencePacket.query_resolution = queryResolution;
    evidencePacket.ranked_manuals = rankedManuals.slice(0, 5);
    if (effectiveIntent === "venting") {
        const ventRecords = (0, ventingEngine_1.extractVentRuleRecords)(manualScoped);
        const bestVent = (0, ventingEngine_1.pickBestVentRule)(body.question, ventRecords);
        if (bestVent) {
            const ventAnswer = (0, ventingEngine_1.buildVentingAnswerFromRecord)(bestVent, body.question);
            ventAnswer.validator_notes = [...(ventAnswer.validator_notes || []), `vent_rule_records:${ventRecords.length}`];
            const matchedChunk = manualScoped.find((c) => c.source_type === 'manual' && c.manual_title === bestVent.manual_title && c.source_url === bestVent.source_url && c.page_number === (bestVent.source_page ?? 1));
            const retrievedForValidation = matchedChunk ? [matchedChunk] : manualScoped.slice(0, 3);
            return await finalizeThroughGate({
                question: body.question,
                answer: ventAnswer,
                retrieved: retrievedForValidation,
                evidencePacket: {
                    ...evidencePacket,
                    vent_rule_records: ventRecords.length,
                },
            });
        }
        return await finalizeThroughGate({
            question: body.question,
            answer: unavailable("insufficient_structured_vent_rules", body.question, webHints.top),
            retrieved: manualScoped.slice(0, 1),
            evidencePacket: {
                ...evidencePacket,
                vent_rule_records: 0,
            },
        });
    }
    if (effectiveIntent === "electrical" || effectiveIntent === "remote operation") {
        const wiringRecords = (0, wiringEngine_1.extractWiringRecords)(manualScoped);
        const bestWiring = (0, wiringEngine_1.pickBestWiringRecord)(body.question, wiringRecords);
        if (bestWiring) {
            const relatedWiring = wiringRecords.slice(0, 20);
            const wiringAnswer = (0, wiringEngine_1.buildWiringAnswerFromRecord)(bestWiring, body.question, relatedWiring);
            wiringAnswer.validator_notes = [...(wiringAnswer.validator_notes || []), `wiring_rule_records:${wiringRecords.length}`];
            const matchedChunk = manualScoped.find((c) => c.source_type === 'manual' && c.manual_title === bestWiring.manual_title && c.source_url === bestWiring.source_url && c.page_number === (bestWiring.source_page ?? 1));
            const retrievedForValidation = matchedChunk ? [matchedChunk] : manualScoped.slice(0, 3);
            return await finalizeThroughGate({
                question: body.question,
                answer: wiringAnswer,
                retrieved: retrievedForValidation,
                evidencePacket: {
                    ...evidencePacket,
                    wiring_graph_records: wiringRecords.length,
                },
            });
        }
        return await finalizeThroughGate({
            question: body.question,
            answer: unavailable("insufficient_structured_wiring_graph", body.question, webHints.top),
            retrieved: manualScoped.slice(0, 1),
            evidencePacket: {
                ...evidencePacket,
                wiring_graph_records: 0,
            },
        });
    }
    if (effectiveIntent === "replacement parts") {
        const partsRecords = (0, partsEngine_1.extractPartsRecords)(manualScoped);
        const bestParts = (0, partsEngine_1.pickBestPartsRecord)(body.question, partsRecords);
        if (bestParts) {
            const relatedParts = partsRecords.slice(0, 20);
            const partsAnswer = (0, partsEngine_1.buildPartsAnswerFromRecord)(bestParts, body.question, relatedParts);
            partsAnswer.validator_notes = [...(partsAnswer.validator_notes || []), `parts_rule_records:${partsRecords.length}`];
            const matchedChunk = manualScoped.find((c) => c.source_type === 'manual' && c.manual_title === bestParts.manual_title && c.source_url === bestParts.source_url && c.page_number === (bestParts.source_page ?? 1));
            if (matchedChunk) {
                const strictQuote = extractQuote(body.question, matchedChunk.chunk_text || '') || (matchedChunk.chunk_text || '').split(/\s+/).slice(0, 32).join(' ');
                partsAnswer.quote = strictQuote;
                partsAnswer.page_number = matchedChunk.page_number;
            }
            const retrievedForValidation = matchedChunk ? [matchedChunk] : manualScoped.slice(0, 3);
            return await finalizeThroughGate({
                question: body.question,
                answer: partsAnswer,
                retrieved: retrievedForValidation,
                evidencePacket: {
                    ...evidencePacket,
                    parts_structured_records: partsRecords.length,
                },
            });
        }
        return await finalizeThroughGate({
            question: body.question,
            answer: unavailable("insufficient_structured_parts_records", body.question, webHints.top),
            retrieved: manualScoped.slice(0, 1),
            evidencePacket: {
                ...evidencePacket,
                parts_structured_records: 0,
            },
        });
    }
    const rerankedCandidates = rerankCandidates(body.question, candidatePool, effectiveIntent).slice(0, 40);
    const framingPreferred = selectFramingPreferredChunk(body.question, rerankedCandidates);
    const selectedChunks = framingPreferred ? [framingPreferred] : selectDeterministicManualChunks(body.question, rerankedCandidates);
    const requiredEvidence = requiresStrictEvidence(body.question) ? config_1.minEvidenceChunks : Math.max(1, config_1.minEvidenceChunks - 1);
    if (selectedChunks.length < requiredEvidence) {
        return await finalizeThroughGate({ question: body.question, answer: unavailable("insufficient_evidence", body.question, webHints.top), retrieved: manualScoped.slice(0, 1), evidencePacket });
    }
    const candidateChunks = selectedChunks.slice(0, 2);
    const chosenChunk = candidateChunks[0];
    if (effectiveIntent === "code compliance") {
        const complianceRecords = (0, complianceEngine_1.extractComplianceRecords)(manualScoped, body.question);
        const bestCompliance = (0, complianceEngine_1.pickBestComplianceRecord)(body.question, complianceRecords);
        if (bestCompliance) {
            const complianceAnswer = (0, complianceEngine_1.buildComplianceAnswerFromRecord)(bestCompliance, body.question);
            complianceAnswer.validator_notes = [
                ...(complianceAnswer.validator_notes || []),
                `compliance_structured_records:${complianceRecords.length}`,
            ];
            const matchedChunk = manualScoped.find((c) => c.source_type === 'manual' &&
                c.manual_title === bestCompliance.manual_title &&
                c.source_url === bestCompliance.source_url &&
                c.page_number === (bestCompliance.source_page ?? 1));
            const retrievedForValidation = matchedChunk ? [matchedChunk] : manualScoped.slice(0, 3);
            return await finalizeThroughGate({
                question: body.question,
                answer: complianceAnswer,
                retrieved: retrievedForValidation,
                evidencePacket: {
                    ...evidencePacket,
                    compliance_structured_records: complianceRecords.length,
                },
            });
        }
        return await finalizeThroughGate({
            question: body.question,
            answer: (0, complianceEngine_1.buildComplianceRefusal)(body.question, "insufficient_explicit_manufacturer_compliance_support"),
            retrieved: manualScoped.slice(0, 1),
            evidencePacket: {
                ...evidencePacket,
                compliance_structured_records: 0,
            },
        });
    }
    const explicitModelScoped = buildModelPhrases(body.question).length > 0;
    if (!explicitModelScoped && !hasQueryTermOverlap(body.question, chosenChunk.chunk_text)) {
        metrics.gabe_wrong_manual_total += 1;
        return await finalizeThroughGate({ question: body.question, answer: unavailable("semantic_mismatch", body.question, webHints.top), retrieved: [chosenChunk], evidencePacket });
    }
    const intentFastPath = buildIntentFastPath(effectiveIntent, body.question, chosenChunk);
    if (intentFastPath) {
        return await finalizeThroughGate({ question: body.question, answer: intentFastPath, retrieved: [chosenChunk], evidencePacket });
    }
    const framingFastPath = buildFramingFastPath(body.question, chosenChunk);
    if (framingFastPath) {
        return await finalizeThroughGate({ question: body.question, answer: framingFastPath, retrieved: [chosenChunk], evidencePacket });
    }
    for (let i = 0; i < candidateChunks.length; i += 1) {
        const c = candidateChunks[i];
        try {
            const answer = await (0, groq_1.callGroq)([c], body.question);
            const verdict = (0, validatorAgent_1.validateOrReject)(answer, [c]);
            if (verdict.ok) {
                return await finalizeThroughGate({ question: body.question, answer: verdict.answer, retrieved: [c], evidencePacket });
            }
            (0, selfRefiner_1.logRefinementEvent)({
                question: body.question,
                intent: effectiveIntent,
                model: `${modelDetection.brand || ''} ${modelDetection.model || ''}`.trim() || undefined,
                failure: verdict.reason,
                action: `validator_rejected_attempt_${i + 1}`,
            });
        }
        catch (err) {
            (0, selfRefiner_1.logRefinementEvent)({
                question: body.question,
                intent: effectiveIntent,
                model: `${modelDetection.brand || ''} ${modelDetection.model || ''}`.trim() || undefined,
                failure: err instanceof Error ? err.message : "reasoner_error",
                action: `reasoner_error_attempt_${i + 1}`,
            });
        }
    }
    request.log.error("GABE validator rejected all attempts; falling back to extractive answer");
    const fallback = buildExtractiveAnswer(body.question, chosenChunk);
    if (fallback) {
        return await finalizeThroughGate({ question: body.question, answer: fallback, retrieved: [chosenChunk], evidencePacket });
    }
    return await finalizeThroughGate({
        question: body.question,
        answer: unavailable("validation_failed", body.question, webHints.top),
        retrieved: [chosenChunk],
        evidencePacket,
    });
});
async function directFramingLookupFromStore(question) {
    const q = question.toLowerCase();
    if (!(q.includes("framing") && q.includes("dimension")))
        return null;
    const modelPhrases = buildModelPhrases(question);
    if (modelPhrases.length === 0)
        return null;
    const modelForDimensionQuery = modelPhrases.sort((a, b) => b.length - a.length)[0];
    const dimensions = await (0, dimensionsStore_1.queryDimensionsByModelTopic)({ model: modelForDimensionQuery, topic: "framing" });
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
    const scroll = await qdrant_1.qdrant.scroll(config_1.env.QDRANT_COLLECTION, {
        limit: 200,
        with_payload: true,
        with_vector: false,
        filter: {
            should: shouldTerms.map((term) => ({ key: "chunk_text", match: { text: term } }))
        }
    });
    const points = (scroll.points || []).map((r) => {
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
        };
    });
    const matched = points.filter((c) => {
        const hay = `${c.manufacturer} ${c.model} ${c.manual_title}`.toLowerCase();
        return modelPhrases.some((p) => hay.includes(p));
    });
    if (matched.length === 0)
        return null;
    const nonIndex = matched.filter((m) => {
        const t = m.chunk_text.toLowerCase();
        return !t.includes("table of contents") && !/^\d+\s+index\b/i.test(t.trim()) && !t.includes("........");
    });
    const pool = nonIndex.length > 0 ? nonIndex : matched;
    return pool.find((m) => /fireplace framing|minimum framing dimensions/i.test(m.chunk_text)) || pool[0] || null;
}
function selectFramingPreferredChunk(question, candidates) {
    const q = question.toLowerCase();
    if (!(q.includes("framing") && q.includes("dimension")))
        return null;
    const modelPhrases = buildModelPhrases(question);
    const matched = candidates.filter((c) => {
        const hay = `${c.manufacturer} ${c.model} ${c.manual_title}`.toLowerCase();
        if (modelPhrases.length > 0 && !modelPhrases.some((p) => hay.includes(p)))
            return false;
        const t = c.chunk_text.toLowerCase();
        return t.includes("minimum framing dimensions") || t.includes("fireplace framing") || (t.includes("framing") && t.includes("dimension"));
    });
    return matched.sort((a, b) => b.score - a.score)[0] || null;
}
function tryDirectFramingLookup(question, keywordResults) {
    const q = question.toLowerCase();
    if (!(q.includes("framing") && q.includes("dimension")))
        return null;
    const modelPhrases = buildModelPhrases(question);
    if (modelPhrases.length === 0)
        return null;
    const matchedModel = keywordResults.filter((r) => {
        const hay = `${r.manufacturer} ${r.model} ${r.manual_title}`.toLowerCase();
        return modelPhrases.some((p) => hay.includes(p));
    });
    const framingChunks = matchedModel.filter((r) => {
        const t = r.chunk_text.toLowerCase();
        return t.includes("minimum framing dimensions") || t.includes("fireplace framing") || (t.includes("framing") && t.includes("dimension"));
    });
    const pick = framingChunks[0];
    if (!pick)
        return null;
    const fast = buildFramingFastPath(question, pick);
    return fast;
}
function unavailable(reason, question, webHint) {
    if (reason === "validation_failed")
        metrics.gabe_missing_citation_total += 1;
    // Directional web fallback when manual evidence is insufficient.
    if (webHint && (reason === "insufficient_evidence" || reason === "semantic_mismatch")) {
        return {
            answer: `I couldn't verify this in loaded manufacturer manuals yet. Web direction: ${webHint.title}. I can use this to guide next lookup, but final technical steps should be manual-verified.`,
            source_type: "web",
            url: webHint.url,
            section: "web_search",
            quote: webHint.snippet || webHint.title,
            confidence: 35,
            certainty: "Interpreted",
            run_outcome: "source_evidence_missing",
            validator_notes: ["web_fallback_directional", reason]
        };
    }
    return {
        answer: "This information is not available in verified manufacturer documentation.",
        source_type: "none",
        confidence: 0,
        certainty: "Unverified",
        run_outcome: "refused_unverified",
        validator_notes: [reason],
        no_answer_reason: reason
    };
}
function buildGuidedFallbackAnswer(reason, question) {
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
function buildFramingFastPath(question, chunk) {
    if (!chunk || chunk.source_type !== "manual")
        return null;
    const q = question.toLowerCase();
    const isFraming = q.includes("framing") && q.includes("dimension");
    if (!isFraming)
        return null;
    const text = chunk.chunk_text.replace(/\s+/g, " ");
    const dims = extractFramingDimensions(text);
    let answer;
    let quote;
    if (dims.length > 0) {
        const inferred = inferOpeningDimensionsFromFramingList(dims);
        if (inferred) {
            answer = `Minimum opening dimensions: ${inferred.widthIn}\" W × ${inferred.heightIn}\" H × ${inferred.depthIn}\" D.`;
            quote = `Minimum opening: ${inferred.widthIn}\" W, ${inferred.heightIn}\" H, ${inferred.depthIn}\" D`;
        }
        else {
            const dimText = dims.join(", ");
            answer = `Minimum framing dimensions listed: ${dimText}.`;
            quote = dimText;
        }
    }
    else {
        const sentences = text
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const pick = sentences.find((s) => /framing|dimension|minimum/i.test(s));
        if (!pick)
            return null;
        quote = pick.split(/\s+/).slice(0, 25).join(" ");
        answer = `Manual states: "${quote}"`;
    }
    return {
        answer,
        source_type: "manual",
        manual_title: chunk.manual_title,
        page_number: chunk.page_number,
        source_url: chunk.source_url,
        quote,
        confidence: 80,
        certainty: "Verified Partial",
        validator_notes: ["framing_fast_path"]
    };
}
function inferOpeningDimensionsFromDimensionRecords(records) {
    const nums = records
        .map((r) => Number(r.value_imperial))
        .filter((n) => Number.isFinite(n) && n > 1 && n < 200);
    if (nums.length === 0)
        return null;
    const near = (target, tol) => nums.find((n) => Math.abs(n - target) <= tol);
    const height = near(81, 1.5) ?? Math.max(...nums.filter((n) => n <= 120));
    const width = near(42, 2) ?? near(46, 2) ?? nums.find((n) => n >= 34 && n <= 60);
    const depth = near(23, 2) ?? near(17, 2) ?? nums.find((n) => n >= 12 && n <= 30);
    if (!height || !width || !depth)
        return null;
    const fmt = (n) => {
        const rounded = Math.round(n * 1000) / 1000;
        return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
    };
    return { widthIn: fmt(width), heightIn: fmt(height), depthIn: fmt(depth) };
}
function inferOpeningDimensionsFromFramingList(items) {
    const nums = [];
    const re = /(\d+(?:-\d+\/\d+|\/\d+)?)/g;
    const fracToFloat = (s) => {
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
        if (!m)
            continue;
        for (const tok of m) {
            const v = fracToFloat(tok);
            if (Number.isFinite(v) && v > 1 && v < 200)
                nums.push(v);
        }
    }
    if (nums.length === 0)
        return null;
    // Pick likely opening dimensions from common fireplace framing ranges.
    const near = (target, tol) => nums.find((n) => Math.abs(n - target) <= tol);
    const height = near(81, 1.5) ?? Math.max(...nums.filter((n) => n <= 120));
    const width = near(42, 2) ?? near(46, 2) ?? nums.find((n) => n >= 34 && n <= 60);
    const depth = near(23, 2) ?? near(17, 2) ?? nums.find((n) => n >= 12 && n <= 30);
    if (!height || !width || !depth)
        return null;
    const fmt = (n) => {
        const rounded = Math.round(n * 1000) / 1000;
        return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
    };
    return { widthIn: fmt(width), heightIn: fmt(height), depthIn: fmt(depth) };
}
function extractFramingDimensions(text) {
    const results = [];
    const reLetter = /\(([a-z])\)\s*([0-9]+(?:-[0-9]+\/[0-9]+|\/[0-9]+)?(?:\"|”)?\s*\([0-9]+mm\))/gi;
    let m;
    while ((m = reLetter.exec(text)) !== null) {
        results.push(`(${m[1]}) ${m[2]}`);
    }
    if (results.length === 0) {
        const reSimple = /([0-9]+(?:-[0-9]+\/[0-9]+|\/[0-9]+)?(?:\"|”)?\s*\([0-9]+mm\))/g;
        const found = text.match(reSimple) || [];
        for (const f of found.slice(0, 4))
            results.push(f);
    }
    return Array.from(new Set(results));
}
function buildIntentFastPath(intent, question, chunk) {
    const text = chunk.chunk_text || '';
    const mk = (answer, quote, note) => ({
        answer,
        source_type: 'manual',
        manual_title: chunk.manual_title,
        page_number: chunk.page_number,
        source_url: chunk.source_url,
        quote,
        confidence: 78,
        certainty: 'Verified Partial',
        validator_notes: [note],
    });
    if (intent === 'venting') {
        const q = extractQuote(question, text);
        if (q)
            return mk('Manufacturer venting guidance found in cited section.', q, 'venting_fast_path');
    }
    if (intent === 'electrical' || intent === 'remote operation') {
        const q = extractQuote(question, text);
        if (q)
            return mk('Manufacturer wiring/control guidance found in cited section.', q, 'wiring_fast_path');
    }
    if (intent === 'replacement parts') {
        const q = extractQuote(question, text);
        if (q)
            return mk('Manufacturer parts guidance found in cited section.', q, 'parts_fast_path');
    }
    if (intent === 'code compliance') {
        const q = extractQuote(question, text);
        if (q)
            return mk('Manufacturer compliance-related guidance found in cited section.', q, 'code_fast_path');
    }
    return null;
}
function buildExtractiveAnswer(question, chunk) {
    if (!chunk || chunk.source_type !== "manual")
        return null;
    const quote = extractQuote(question, chunk.chunk_text);
    if (!quote)
        return null;
    const intents = extractIntentTerms(question);
    const quoteLc = quote.toLowerCase();
    if (intents.length > 0 && !intents.some((t) => quoteLc.includes(t))) {
        return null;
    }
    return {
        answer: `Manual states: "${quote}"`,
        source_type: "manual",
        manual_title: chunk.manual_title,
        page_number: chunk.page_number,
        source_url: chunk.source_url,
        quote,
        confidence: 60,
        certainty: "Verified Partial",
        validator_notes: ["extractive_fallback"]
    };
}
function extractQuote(question, text) {
    const q = question.toLowerCase();
    const keywords = [];
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
        if (keywords.length > 0 && keywords.some((k) => sl.includes(k)))
            return true;
        if (intents.length > 0 && intents.some((k) => sl.includes(k)))
            return true;
        return false;
    })
        ?? sentences[0]
        ?? text;
    const words = pick.split(/\s+/).slice(0, 25);
    return words.join(" ");
}
function rerankCandidates(question, candidates, intent) {
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
        if (/installation manual/i.test(c.manual_title) && (q.includes("install") || q.includes("require") || q.includes("clearance") || q.includes("framing")))
            boost += 0.05;
        if (q.includes("framing") && q.includes("dimension")) {
            if (text.includes("minimum framing dimensions") || text.includes("fireplace framing"))
                boost += 0.25;
            else if (text.includes("framing"))
                boost += 0.12;
        }
        if (section.includes("introduction") || text.includes("table of contents") || text.includes("welcome you as a new owner"))
            boost -= 0.12;
        if (intent === 'venting' && /vent|termination|horizontal|vertical|elbow|pipe/.test(text))
            boost += 0.14;
        return { ...c, score: Math.max(0, Math.min(1, c.score + boost)) };
    })
        .sort((a, b) => b.score - a.score);
}
function selectDeterministicManualChunks(question, candidates) {
    if (candidates.length === 0)
        return [];
    const { brandHints, tokens } = extractQuestionHints(question);
    const modelPhrases = buildModelPhrases(question);
    const groups = new Map();
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
    if (second && (best.groupScore - second.groupScore) < config_1.manualSelectionMinMargin) {
        const bestTop = best.chunks[0];
        const secondTop = second.chunks[0];
        if (bestTop && secondTop && bestTop.score < 0.8 && secondTop.score > 0.72)
            return [];
    }
    return best.chunks.slice(0, 3);
}
function applyKeywordBoost(question, results) {
    const q = question.toLowerCase();
    const keywords = [];
    if (q.includes("outside air") || q.includes("combustion air") || q.includes("air intake") || q.includes("oak")) {
        keywords.push("outside air", "combustion air", "air intake", "outside combustion", "oak", "outside combustion air");
    }
    if (keywords.length === 0)
        return results;
    return results.map((r) => {
        const text = r.chunk_text.toLowerCase();
        const hit = keywords.some((k) => text.includes(k));
        if (!hit)
            return r;
        let bonus = 0.08;
        if (text.includes("air intake installation") ||
            text.includes("requires an air intake") ||
            text.includes("combustion air")) {
            bonus += 0.18;
        }
        return { ...r, score: Math.min(1, r.score + bonus) };
    });
}
function rankAirChunk(chunk) {
    const text = chunk.chunk_text.toLowerCase();
    let score = 0;
    if (text.includes("air intake installation"))
        score += 3;
    if (text.includes("air intake locations"))
        score += 2;
    if (text.includes("air intake collar"))
        score += 2;
    if (text.includes("combustion air"))
        score += 2;
    if (text.includes("requires"))
        score += 2;
    return score;
}
function fuseHybridResults(vectorResults, keywordResults) {
    const k = 60;
    const scoreMap = new Map();
    const add = (r, rank) => {
        const key = `${r.source_url}|${r.page_number}|${r.manual_title}`;
        const existing = scoreMap.get(key);
        const addScore = 1 / (k + rank + 1);
        if (existing) {
            existing._rrf += addScore;
        }
        else {
            scoreMap.set(key, { ...r, _rrf: addScore });
        }
    };
    vectorResults.forEach((r, idx) => add(r, idx));
    keywordResults.forEach((r, idx) => add(r, idx));
    return Array.from(scoreMap.values())
        .sort((a, b) => b._rrf - a._rrf)
        .map(({ _rrf, ...rest }) => rest);
}
function applyManualHintFilter(question, results) {
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
        if (noFlyers.length > 0)
            scored.splice(0, scored.length, ...noFlyers);
    }
    if (modelTokens.length > 0) {
        const modelMatches = scored.filter((s) => {
            if (s.modelHit < 2)
                return false;
            if (numericTokens.length === 0)
                return true;
            const hay = `${s.r.manual_title} ${s.r.manufacturer} ${s.r.model}`.toLowerCase();
            return numericTokens.some((t) => hay.includes(t));
        });
        if (modelMatches.length > 0)
            return { filtered: modelMatches.map((s) => s.r) };
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
    if (preferred.length > 0)
        return { filtered: preferred };
    return { filtered: results };
}
function extractQuestionHints(question) {
    const q = question.toLowerCase();
    const brandHints = ["fpx", "lopi", "majestic", "monessen", "travis"].filter((b) => q.includes(b));
    const tokens = q
        .split(/[^a-z0-9]+/i)
        .filter(Boolean)
        .filter((t) => t.length >= 2);
    const hasBrandOrModel = brandHints.length > 0 || tokens.some((t) => /^\d+$/.test(t));
    return { q, brandHints, tokens, hasBrandOrModel };
}
function buildModelPhrases(question) {
    const q = question.toLowerCase();
    const phrases = [];
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
        if (q.includes(p))
            phrases.push(p);
    }
    return phrases;
}
function isTechnicalQuestion(q) {
    const technicalTerms = [
        "outside air", "combustion air", "air intake", "oak", "vent", "venting",
        "clearance", "install", "installation", "requirements", "required",
        "manual", "page", "spec", "specs", "pipe", "chimney", "service",
        "smell gas", "gas leak", "before lighting", "pilot", "lighting"
    ];
    return technicalTerms.some((t) => q.includes(t));
}
function buildKeywordTerms(question, extraTerms = []) {
    const q = question.toLowerCase();
    const terms = new Set();
    const airTerms = ["outside air", "combustion air", "air intake", "outside combustion air", "oak"];
    airTerms.forEach((t) => {
        if (q.includes(t))
            terms.add(t);
    });
    const { brandHints, tokens } = extractQuestionHints(question);
    brandHints.forEach((b) => terms.add(b));
    tokens.forEach((t) => {
        if (t.length >= 3)
            terms.add(t);
    });
    extraTerms.forEach((t) => {
        if (t && t.length >= 3)
            terms.add(t.toLowerCase());
    });
    return Array.from(terms);
}
function extractIntentTerms(question) {
    const q = question.toLowerCase();
    const terms = [
        "outside air", "combustion air", "air intake", "oak",
        "vent", "venting", "chimney", "clearance", "pressure", "manifold", "hearth", "floor protection", "gas inlet",
        "framing", "framing dimensions", "minimum framing", "fireplace framing", "rough opening", "width", "height", "depth",
        "smell gas", "gas leak", "do not light", "before lighting", "pilot"
    ];
    return terms.filter((t) => q.includes(t));
}
function applyTechnicalFilter(question, results) {
    const q = question.toLowerCase();
    if (!isTechnicalQuestion(q))
        return { filtered: results };
    const airKeywords = ["outside air", "combustion air", "air intake", "oak", "outside combustion air"];
    const keywords = [...airKeywords, "vent", "venting", "chimney", "clearance", "install", "installation", "service", "pressure", "manifold", "hearth", "floor protection", "gas inlet", "framing", "dimensions", "minimum framing", "rough opening", "width", "height", "depth", "smell gas", "gas leak", "do not light", "before lighting", "pilot"];
    const prefersInstall = q.includes("install") ||
        q.includes("installation") ||
        q.includes("requirements") ||
        q.includes("combustion air") ||
        q.includes("outside air") ||
        q.includes("air intake") ||
        q.includes("oak");
    let filtered = results.filter((r) => r.page_number > 1 || r.chunk_text.length > 300);
    if (prefersInstall) {
        const installOnly = filtered.filter((r) => r.doc_type === "installation" || /installation manual/i.test(r.manual_title));
        if (installOnly.length > 0)
            filtered = installOnly;
    }
    const requiresAir = airKeywords.some((k) => q.includes(k));
    const intents = extractIntentTerms(question);
    const keywordHits = filtered.filter((r) => {
        const text = r.chunk_text.toLowerCase();
        if (requiresAir) {
            if (!(text.includes("air intake") || text.includes("combustion air") || text.includes("outside combustion")))
                return false;
            if (text.includes("air intake parts"))
                return false;
            return true;
        }
        if (intents.length > 0) {
            return intents.some((k) => text.includes(k));
        }
        return keywords.some((k) => text.includes(k));
    });
    if (keywordHits.length === 0)
        return { filtered: [] };
    const notIntro = keywordHits.filter((r) => {
        const t = r.chunk_text.toLowerCase();
        return !(t.includes("introduction") ||
            t.includes("table of contents") ||
            t.includes("welcome you as a new owner"));
    });
    const cleanedHits = notIntro.length > 0 ? notIntro : keywordHits;
    if (requiresAir) {
        filtered = cleanedHits
            .map((r) => ({ r, score: rankAirChunk(r) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map((x) => x.r);
    }
    else {
        const sectionHits = cleanedHits.filter((r) => {
            const s = (r.section_title || "").toLowerCase();
            return s.includes("air intake") || s.includes("clearance") || s.includes("vent") || s.includes("chimney") || s.includes("pressure") || s.includes("hearth");
        });
        filtered = sectionHits.length > 0 ? sectionHits : cleanedHits;
    }
    return { filtered };
}
function requiresStrictEvidence(question) {
    const q = question.toLowerCase();
    return ["outside air", "combustion air", "air intake", "clearance", "pressure", "service", "smell gas", "gas leak", "before lighting"].some((t) => q.includes(t));
}
function classifyLowIntentQuestion(question) {
    const q = (question || "").trim().toLowerCase();
    if (!q)
        return "empty_query";
    if (["test", "testing", "hello", "hi", "hey", "yo", "sup"].includes(q))
        return "low_intent_query";
    const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.length <= 2 && !isTechnicalQuestion(q))
        return "low_intent_query";
    return null;
}
function hasQueryTermOverlap(question, chunkText) {
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
    if (qTerms.length === 0)
        return true;
    const hits = qTerms.filter((t) => hay.includes(t)).length;
    return hits >= 1;
}
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
app.listen({ port: Number(config_1.env.PORT), host: "0.0.0.0" });
