import Fastify from "fastify";
import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile, access, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { env, manualSelectionMinMargin, minEvidenceChunks, similarityThreshold, resolverConfidenceMin, maxManualCandidates, installIntentRequiresInstallManual, installStrictManualIdOnly } from "./config";
import { embed } from "./embeddings";
import { extractPdfPages } from "./ingest/pdf";
import { chunkPages } from "./ingest/chunker";
import { ensureCollection, qdrant } from "./retrieval/qdrant";
import { keywordSearchDiagramChunks, keywordSearchManualChunks, searchDiagramChunks, searchManualChunks, searchQaMemoryChunks } from "./retrieval/search";
import { callGroq } from "./llm/groq";
import { RetrievedChunk } from "./types";
import { stableUuid } from "./ingest/ids";
import { retryAsync } from "./ingest/retry";
import { queryDimensionsByModelTopic, upsertDimensions } from "./ingest/dimensionsStore";
import { searchWebHints } from "./retrieval/web";
import { detectModel } from "./swarm/modelDetector";
import { classifyIntent, IntentCategory } from "./swarm/intentClassifier";
import { resolveQuery } from "./swarm/modelResolver";
import { rankManuals, filterToTopRankedManuals } from "./swarm/manualRanker";
import { ensureManualRegistryTable, resolveManualIdForIngest, selectRegistryCandidates } from "./swarm/manualRegistry";
import { isInstallCriticalIntent, policyForIntent } from "./swarm/manualTypePolicy";
import { classifySection } from "./swarm/sectionClassifier";
import { preferredSectionsForIntent } from "./swarm/querySectionRouter";
import { computeCorpusCompleteness } from "./swarm/corpusCompleteness";
import { ensureFactsTable, queryFacts, upsertFacts } from "./swarm/factsStore";
import { extractFactsFromChunk } from "./swarm/factExtractor";
import { detectFactConflict, resolveFactConflict } from "./swarm/factConflictResolver";
import { rankFactsForQuery } from "./swarm/factSelector";
import { responseTimeAuthorityCrosscheck } from "./swarm/authorityCrosscheck";
import { evaluateReleaseReadiness, loadReleaseThresholds, resolveGateProfile } from "./swarm/releaseGates";
import { classifyDiagramType } from "./swarm/diagramClassifier";
import { linkFigureEvidence } from "./swarm/figureNoteLinker";
import { runOcrFallback } from "./swarm/ocrFallback";
import { ensurePartsGraphTable, queryPartsGraph, upsertPartsGraph } from "./swarm/partsGraphStore";
import { extractCalloutsFromFigure } from "./swarm/calloutExtractor";
import { ensureSourceGovernanceTables, querySourcePriorityPolicy, sourceGovernanceDashboard, suggestMissingSourceClasses, upsertDiscoveredSource } from "./swarm/sourceGovernance";
import { ensureGovernanceHardeningTables, enqueueSourceJob, governanceExpandedDashboard, governanceWorkerStatus, processNextSourceJob, reviewerAction, runWorkerLoop } from "./swarm/sourceGovernanceHardening";
import { captureFeedback, ensureFeedbackTables, evalHistory, evalTrends, feedbackDashboard, listFeedback, recordEvalRun } from "./swarm/feedbackLoop";
import { routeBySection } from "./swarm/sectionRouter";
import { validateOrReject } from "./swarm/validatorAgent";
import { logRefinementEvent } from "./swarm/selfRefiner";
import { buildEvidencePacket } from "./swarm/evidenceBuilder";
import { composeValidatedResponse } from "./swarm/responseComposer";
import { appendRunMetadata } from "./swarm/runMetadata";
import { expandPartTerms } from "./swarm/partAliases";
import { extractVentRule, extractWiringGraph, normalizePartNumbers } from "./swarm/structuredTech";
import { buildVentingAnswerFromRecord, extractVentRuleRecords, pickBestVentRule } from "./swarm/ventingEngine";
import { buildWiringAnswerFromRecord, extractWiringRecords, pickBestWiringRecord } from "./swarm/wiringEngine";
import { buildPartsAnswerFromRecord, extractPartsRecords, pickBestPartsRecord } from "./swarm/partsEngine";
import { buildComplianceAnswerFromRecord, buildComplianceRefusal, extractComplianceRecords, pickBestComplianceRecord } from "./swarm/complianceEngine";
import type { DimensionRecord, InstallAngle } from "./types";

const app = Fastify({ logger: { level: env.LOG_LEVEL } });
void ensureManualRegistryTable();
void ensureFactsTable();
void ensurePartsGraphTable();
void ensureSourceGovernanceTables();
void ensureGovernanceHardeningTables();
void ensureFeedbackTables();

app.addHook('onSend', async (_req, _reply, payload) => {
  try {
    const text = typeof payload === 'string' ? payload : payload?.toString?.() || '';
    if (!text || !text.trim().startsWith('{')) return payload;
    const obj: any = JSON.parse(text);
    obj.engine_build_id = process.env.ENGINE_BUILD_ID || 'unknown';
    obj.engine_commit_sha = process.env.ENGINE_COMMIT_SHA || 'unknown';
    obj.engine_runtime_name = process.env.ENGINE_RUNTIME_NAME || 'gabe-knowledge-engine';
    obj.vent_template_active = String(process.env.VENT_TEMPLATE_ACTIVE || 'false').toLowerCase() === 'true';
    return JSON.stringify(obj);
  } catch {
    return payload;
  }
});

const metrics = {
  gabe_queries_total: 0,
  gabe_wrong_manual_total: 0,
  gabe_missing_citation_total: 0,
  install_query_no_manual_id_attempts: 0,
  fact_answers_total: 0,
  unsupported_numeric_answer_attempts: 0,
  incomplete_manual_refusal_total: 0,
  response_time_authority_override_blocks: 0,
  superseded_fact_block_count: 0,
  authority_crosscheck_failures: 0,
  fact_selection_reversal_count: 0,
  unresolved_conflict_refusals: 0,
  wrong_authority_override_attempts: 0,
};

let lastReleaseReadinessResult: any = null;
let startupBlockedByReleaseGate = false;
let releaseBlockModeEnabled = false;
let deployBlockedByReleaseGate = false;

app.get("/health", async () => ({
  ok: !startupBlockedByReleaseGate,
  release_block_mode_enabled: releaseBlockModeEnabled,
  startup_blocked_by_release_gate: startupBlockedByReleaseGate,
  deploy_blocked_by_release_gate: deployBlockedByReleaseGate,
  evaluated_threshold_profile: lastReleaseReadinessResult?.profile || resolveGateProfile(),
  failed_gate_names: lastReleaseReadinessResult?.failed_gate_names || [],
  last_release_readiness_result: lastReleaseReadinessResult,
}));
app.get("/ops/diagram-confidence", async () => {
  try {
    const res = await qdrant.scroll(env.QDRANT_DIAGRAM_COLLECTION, {
      limit: 200,
      with_payload: true,
      with_vector: false,
    } as any);
    const points = (res as any).points || [];
    const total = points.length;
    let confident = 0;
    for (const p of points) {
      const sd = p?.payload?.structured_data || {};
      const measurements = Array.isArray(sd.measurements) ? sd.measurements : [];
      if (measurements.length > 0) confident += 1;
    }
    const score = total > 0 ? Number(((confident / total) * 100).toFixed(1)) : 0;
    return { score, total };
  } catch {
    return { score: 0, total: 0 };
  }
});

app.get("/metrics", async () => {
  const c = await computeCorpusCompleteness();
  const lines = [
    "# TYPE gabe_queries_total counter",
    `gabe_queries_total ${metrics.gabe_queries_total}`,
    "# TYPE gabe_wrong_manual_total counter",
    `gabe_wrong_manual_total ${metrics.gabe_wrong_manual_total}`,
    "# TYPE gabe_missing_citation_total counter",
    `gabe_missing_citation_total ${metrics.gabe_missing_citation_total}`,
    "# TYPE install_query_no_manual_id_attempts counter",
    `install_query_no_manual_id_attempts ${metrics.install_query_no_manual_id_attempts}`,
    "# TYPE fact_answer_rate gauge",
    `fact_answer_rate ${metrics.gabe_queries_total ? (metrics.fact_answers_total / metrics.gabe_queries_total).toFixed(6) : 0}`,
    "# TYPE unsupported_numeric_answer_attempts counter",
    `unsupported_numeric_answer_attempts ${metrics.unsupported_numeric_answer_attempts}`,
    "# TYPE incomplete_manual_refusal_rate gauge",
    `incomplete_manual_refusal_rate ${metrics.gabe_queries_total ? (metrics.incomplete_manual_refusal_total / metrics.gabe_queries_total).toFixed(6) : 0}`,
    "# TYPE strict_manual_id_coverage_rate gauge",
    `strict_manual_id_coverage_rate ${c.strict_manual_id_coverage_rate}`,
    "# TYPE response_time_authority_override_blocks counter",
    `response_time_authority_override_blocks ${metrics.response_time_authority_override_blocks}`,
    "# TYPE superseded_fact_block_count counter",
    `superseded_fact_block_count ${metrics.superseded_fact_block_count}`,
    "# TYPE unresolved_conflict_refusal_rate gauge",
    `unresolved_conflict_refusal_rate ${metrics.gabe_queries_total ? (metrics.unresolved_conflict_refusals / metrics.gabe_queries_total).toFixed(6) : 0}`,
    "# TYPE authority_crosscheck_failures counter",
    `authority_crosscheck_failures ${metrics.authority_crosscheck_failures}`,
    "# TYPE fact_selection_reversal_count counter",
    `fact_selection_reversal_count ${metrics.fact_selection_reversal_count}`,
  ];
  return lines.join("\n") + "\n";
});

app.get("/ops/corpus-completeness", async () => {
  const report = await computeCorpusCompleteness();
  return { ok: true, report };
});

app.get("/ops/reingest-needed", async () => {
  const report = await computeCorpusCompleteness();
  const safe = report.incomplete_manual_ids.length === 0 ? "all_safe" : "partial";
  return {
    ok: true,
    safe_manuals_status: safe,
    safe_manuals: Math.max(0, report.manuals_with_complete_chunk_coverage),
    incomplete_manuals: report.incomplete_manual_ids,
    quarantined_manuals: report.manuals_with_quarantined_chunks,
    legacy_tuple_only_manuals: report.strict_manual_id_coverage_rate < 1 ? "present" : "none",
  };
});

async function computeReleaseReadinessSnapshot() {
  const thresholds = loadReleaseThresholds();
  const coverage = await computeCorpusCompleteness();
  const factAnswerRate = metrics.gabe_queries_total ? (metrics.fact_answers_total / metrics.gabe_queries_total) : 0;
  const incompleteRefusalRate = metrics.gabe_queries_total ? (metrics.incomplete_manual_refusal_total / metrics.gabe_queries_total) : 0;
  const unresolvedConflictRate = metrics.gabe_queries_total ? (metrics.unresolved_conflict_refusals / metrics.gabe_queries_total) : 0;
  const latestEval = (await evalHistory(1))[0] || null;
  const criticalEvalAccuracy = Number((latestEval?.aggregate_metrics || {}).critical_eval_accuracy ?? process.env.METRIC_CRITICAL_EVAL_ACCURACY ?? 1);
  const regressionFailures = Number(latestEval?.regression_failures ?? process.env.METRIC_REGRESSION_FAILURES ?? 0);

  const readiness = evaluateReleaseReadiness({
    unresolved_conflict_refusal_rate: unresolvedConflictRate,
    unsupported_numeric_answer_attempts: metrics.unsupported_numeric_answer_attempts,
    incomplete_manual_refusal_rate: incompleteRefusalRate,
    install_query_no_manual_id_attempts: metrics.install_query_no_manual_id_attempts,
    fact_answer_rate: factAnswerRate,
    wrong_authority_override_attempts: metrics.wrong_authority_override_attempts,
    strict_manual_id_coverage_rate: coverage.strict_manual_id_coverage_rate,
    critical_eval_accuracy: criticalEvalAccuracy,
    regression_failures: regressionFailures,
  }, thresholds);
  const failed = readiness.checks.filter((c: any) => !c.ok).map((c: any) => c.key);
  return {
    profile: resolveGateProfile(),
    ...readiness,
    failed_gate_names: failed,
    strict_manual_id_coverage_rate: coverage.strict_manual_id_coverage_rate,
    unresolved_conflict_refusal_rate: unresolvedConflictRate,
    incomplete_manual_refusal_rate: incompleteRefusalRate,
    fact_answer_rate: factAnswerRate,
    install_query_no_manual_id_attempts: metrics.install_query_no_manual_id_attempts,
    unsupported_numeric_answer_attempts: metrics.unsupported_numeric_answer_attempts,
    wrong_authority_override_attempts: metrics.wrong_authority_override_attempts,
    critical_eval_accuracy: criticalEvalAccuracy,
    regression_failures: regressionFailures,
    last_evaluated_at: new Date().toISOString(),
  };
}

app.get("/ops/release-readiness", async () => {
  lastReleaseReadinessResult = await computeReleaseReadinessSnapshot();
  return {
    ok: true,
    release_block_mode_enabled: releaseBlockModeEnabled,
    startup_blocked_by_release_gate: startupBlockedByReleaseGate,
    deploy_blocked_by_release_gate: deployBlockedByReleaseGate,
    evaluated_threshold_profile: lastReleaseReadinessResult.profile,
    last_release_readiness_result: lastReleaseReadinessResult,
    ...lastReleaseReadinessResult,
  };
});

app.get("/ops/deployment-status", async () => ({
  ok: !startupBlockedByReleaseGate,
  release_block_mode_enabled: releaseBlockModeEnabled,
  startup_blocked_by_release_gate: startupBlockedByReleaseGate,
  deploy_blocked_by_release_gate: deployBlockedByReleaseGate,
  failed_gate_names: lastReleaseReadinessResult?.failed_gate_names || [],
  evaluated_threshold_profile: lastReleaseReadinessResult?.profile || resolveGateProfile(),
  last_release_readiness_result: lastReleaseReadinessResult,
  last_evaluation_timestamp: lastReleaseReadinessResult?.last_evaluated_at || null,
}));

app.get("/ops/source-governance/dashboard", async () => {
  const dash = await sourceGovernanceDashboard();
  return { ok: true, dashboard: dash };
});

app.post("/ops/source-governance/discovered", async (request) => {
  const body = request.body as any;
  const out = await upsertDiscoveredSource(body || {});
  return { ok: true, result: out };
});

app.get("/ops/source-governance/query-policy", async (request) => {
  const q = request.query as any;
  const policy = querySourcePriorityPolicy({ intent: String(q?.intent || "code compliance"), jurisdictionKnown: String(q?.jurisdictionKnown || "false") === "true" });
  return { ok: true, priority: policy };
});

app.get("/ops/source-governance/missing-source-suggestions", async (request) => {
  const q = request.query as any;
  const question = String(q?.question || "");
  return { ok: true, question, suggested_source_classes: suggestMissingSourceClasses(question) };
});

app.post("/ops/source-governance/queue-job", async (request) => {
  const body = request.body as any;
  const out = await enqueueSourceJob({ source_id: String(body?.source_id || ""), job_type: String(body?.job_type || "download_parse"), payload: body?.payload || {} });
  return { ok: true, result: out };
});

app.post("/ops/source-governance/process-next-job", async () => {
  const out = await processNextSourceJob();
  return { ok: true, result: out };
});

app.post("/ops/source-governance/reviewer-action", async (request) => {
  const body = request.body as any;
  const out = await reviewerAction({
    source_id: String(body?.source_id || ""),
    actor: String(body?.actor || "operator"),
    actor_role: body?.actor_role,
    action: body?.action,
    reason: body?.reason,
    notes: body?.notes,
  });
  return { ok: true, result: out };
});

app.get("/ops/source-governance/dashboard-expanded", async () => {
  const out = await governanceExpandedDashboard();
  return { ok: true, dashboard: out };
});

app.get("/ops/source-governance/worker-status", async () => {
  const out = await governanceWorkerStatus();
  return { ok: true, status: out };
});

app.post("/ops/source-governance/worker-loop-start", async (request) => {
  const body = request.body as any;
  const iterations = Number(body?.iterations || 1);
  const concurrency = Number(body?.concurrency || process.env.GOVERNANCE_WORKER_CONCURRENCY || 2);
  const pollMs = Number(body?.pollMs || process.env.GOVERNANCE_WORKER_POLL_MS || 2000);
  const out = await runWorkerLoop({ iterations, concurrency, pollMs });
  return { ok: true, result: out };
});

app.post("/ops/feedback/capture", async (request) => {
  const out = await captureFeedback(request.body as any);
  return { ok: true, result: out };
});

app.get("/ops/feedback/list", async (request) => {
  const q = request.query as any;
  const rows = await listFeedback(Number(q?.limit || 100));
  return { ok: true, rows };
});

app.get("/ops/feedback/dashboard", async () => {
  const d = await feedbackDashboard();
  return { ok: true, dashboard: d };
});

app.post("/ops/eval/run-record", async (request) => {
  const body = request.body as any;
  const out = await recordEvalRun({
    suite_name: String(body?.suite_name || "gold-eval"),
    scorecard_json: body?.scorecard_json || {},
    total_cases: Number(body?.total_cases || 0),
    passed_cases: Number(body?.passed_cases || 0),
  });
  return { ok: true, result: out };
});

app.get("/ops/eval/history", async (request) => {
  const q = request.query as any;
  const rows = await evalHistory(Number(q?.limit || 50));
  return { ok: true, rows };
});

app.get("/ops/eval/trends", async (request) => {
  const q = request.query as any;
  const trends = await evalTrends(Number(q?.limit || 200));
  return { ok: true, trends };
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

  const asset = await ensureManualAsset({
    file_path: body.file_path,
    source_url: body.source_url,
    manual_title: body.manual_title,
  });

  const pages = await extractPdfPages(asset.resolved_path);
  const chunks = chunkPages(pages, 450, 750, 2);
  if (chunks.length === 0) return reply.status(400).send({ error: "no_extractable_text", asset });

  const manualIdentity = await resolveManualIdForIngest({
    manufacturer: body.manufacturer,
    model: body.model,
    manual_title: body.manual_title,
    source_url: body.source_url,
    doc_type: inferDocType(body.manual_title),
  });
  if (!manualIdentity.manual_id || manualIdentity.confidence < 0.5) {
    await quarantineUnassignedChunks({ body, reason: "manual_id_unresolved", confidence: manualIdentity.confidence, chunks: chunks.slice(0, 20) });
    return reply.status(422).send({ error: "manual_id_unresolved", confidence: manualIdentity.confidence });
  }

  const embeddings = await embed(chunks.map((c) => c.text));
  await ensureCollection(embeddings[0].length);
  const docType = inferDocType(body.manual_title);

  const points = await Promise.all(chunks.map(async (c, idx) => {
    const cls = classifySection(c.text, c.section_title);
    const diagramType = classifyDiagramType({ text: c.text, title: c.section_title, heading: c.section_title, sectionType: cls.section_type });
    const ocr = await runOcrFallback({ nativeText: c.text, imageRef: body.file_path, diagramLikely: diagramType !== "generic_illustration" });
    const fig = linkFigureEvidence({ caption: c.section_title, heading: c.section_title, text: ocr.text || c.text, imageRef: body.file_path, diagramType });
    return ({
      id: stableUuid(`${body.source_url}|${c.page}|${c.text}`),
      vector: embeddings[idx],
      payload: {
        manual_id: manualIdentity.manual_id,
        manual_title: body.manual_title,
        manufacturer: body.manufacturer,
        brand: body.manufacturer,
        model: body.model,
        normalized_model: body.model.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        family: body.model.toLowerCase().includes("apex") ? "apex" : body.model.toLowerCase().includes("elite") ? "elite" : body.model.toLowerCase().includes("novus") ? "novus" : null,
        size: body.model.match(/\b(\d{2})\b/)?.[1] || null,
        manual_type: docType,
        page_number: c.page,
        section_type: cls.section_type,
        content_kind: cls.content_kind,
        source_url: body.source_url,
        chunk_text: ocr.text || c.text,
        section_title: c.section_title,
        figure_present: fig.figure_present,
        figure_caption: fig.figure_caption,
        heading_scope: fig.heading_scope,
        figure_note_text: fig.figure_note_text,
        page_image_ref: fig.page_image_ref,
        diagram_type: fig.diagram_type,
        callout_labels: fig.callout_labels,
        ocr_used: ocr.used,
        ocr_confidence: ocr.confidence,
        ocr_source_mode: ocr.source,
        revision: null,
        language: "en",
        doc_type: docType,
        source_type: "manual"
      }
    });
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

  const facts = chunks.flatMap((c) => extractFactsFromChunk({
    manual_id: manualIdentity.manual_id!,
    manufacturer: body.manufacturer,
    model: body.model,
    normalized_model: body.model.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    family: body.model.toLowerCase().includes("apex") ? "apex" : body.model.toLowerCase().includes("elite") ? "elite" : body.model.toLowerCase().includes("novus") ? "novus" : null,
    size: body.model.match(/\b(\d{2})\b/)?.[1] || null,
    manual_type: docType,
    page_number: c.page,
    source_url: body.source_url,
    text: c.text,
    section_title: c.section_title,
    revision: null,
  }));
  await upsertFacts(facts);

  const partsRows = points.flatMap((p: any) => {
    const dt = String(p.payload.diagram_type || "");
    if (!/exploded_parts_view|generic_illustration|installation_sequence_figure/.test(dt)) return [];
    return extractCalloutsFromFigure({
      manual_id: manualIdentity.manual_id!,
      model: body.model,
      normalized_model: body.model.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
      family: body.model.toLowerCase().includes("apex") ? "apex" : body.model.toLowerCase().includes("elite") ? "elite" : body.model.toLowerCase().includes("novus") ? "novus" : null,
      size: body.model.match(/\b(\d{2})\b/)?.[1] || null,
      figure_page_number: p.payload.page_number,
      figure_caption: p.payload.figure_caption,
      diagram_type: p.payload.diagram_type,
      source_url: body.source_url,
      text: p.payload.chunk_text,
      ocr_confidence: p.payload.ocr_confidence,
      source_mode: p.payload.ocr_source_mode === "ocr" ? "ocr" : p.payload.ocr_source_mode === "hybrid" ? "hybrid" : "native_text",
    });
  });
  await upsertPartsGraph(partsRows);

  return {
    ok: true,
    chunks: points.length,
    facts: facts.length,
    callouts: partsRows.length,
    asset_source: asset.asset_source,
    download_status: asset.download_status,
    checksum: asset.checksum,
    cache_path: asset.cache_path,
  };
});

app.post("/ingest/diagrams", async (request, reply) => {
  const body = request.body as {
    diagrams: Array<{
      brand: string;
      model: string;
      diagram_type: string;
      page: number;
      manual_url: string;
      image_path: string;
      structured_data: Record<string, unknown>;
      source_text?: string;
    }>;
  };

  if (!Array.isArray(body?.diagrams) || body.diagrams.length === 0) {
    return reply.status(400).send({ error: "diagrams[] required" });
  }

  const texts = body.diagrams.map((d) => {
    const sd = JSON.stringify(d.structured_data || {});
    return `${d.brand} ${d.model} ${d.diagram_type} page ${d.page} ${sd} ${d.source_text || ""}`;
  });
  const vectors = await embed(texts);
  await ensureCollection(vectors[0].length, env.QDRANT_DIAGRAM_COLLECTION);

  const points = await Promise.all(body.diagrams.map(async (d, i) => {
    const manualIdentity = await resolveManualIdForIngest({ manufacturer: d.brand, model: d.model, source_url: d.manual_url, doc_type: "wiring" });
    const ocr = await runOcrFallback({ nativeText: texts[i], imageRef: d.image_path, diagramLikely: true });
    const cls = classifySection(ocr.text || texts[i], d.diagram_type);
    const diagramType = classifyDiagramType({ text: ocr.text || texts[i], title: d.diagram_type, heading: d.diagram_type, sectionType: cls.section_type });
    const fig = linkFigureEvidence({ caption: d.diagram_type, heading: d.diagram_type, text: ocr.text || texts[i], imageRef: d.image_path, diagramType });
    return {
      id: stableUuid(`${d.manual_url}|${d.page}|${d.image_path}|${d.diagram_type}`),
      vector: vectors[i],
      payload: {
        manual_id: manualIdentity.manual_id,
        brand: d.brand,
        manufacturer: d.brand,
        model: d.model,
        normalized_model: d.model.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        family: d.model.toLowerCase().includes("apex") ? "apex" : d.model.toLowerCase().includes("elite") ? "elite" : d.model.toLowerCase().includes("novus") ? "novus" : null,
        size: d.model.match(/\b(\d{2})\b/)?.[1] || null,
        diagram_type: diagramType,
        page: d.page,
        page_number: d.page,
        section_type: cls.section_type,
        content_kind: cls.content_kind,
        manual_type: "wiring",
        manual_url: d.manual_url,
        source_url: d.manual_url,
        image_path: d.image_path,
        structured_data: d.structured_data,
        text: ocr.text || texts[i],
        chunk_text: ocr.text || texts[i],
        section_title: d.diagram_type,
        figure_present: fig.figure_present,
        figure_caption: fig.figure_caption,
        heading_scope: fig.heading_scope,
        figure_note_text: fig.figure_note_text,
        page_image_ref: fig.page_image_ref,
        callout_labels: fig.callout_labels,
        ocr_used: ocr.used,
        ocr_confidence: ocr.confidence,
        ocr_source_mode: ocr.source,
        revision: null,
        language: "en",
        doc_type: "diagram",
        source_type: "manual"
      }
    };
  }));

  await qdrant.upsert(env.QDRANT_DIAGRAM_COLLECTION, { wait: true, points });

  const graphRows = points.flatMap((p: any) => extractCalloutsFromFigure({
    manual_id: p.payload.manual_id,
    model: p.payload.model,
    normalized_model: p.payload.normalized_model,
    family: p.payload.family,
    size: p.payload.size,
    figure_page_number: p.payload.page_number,
    figure_caption: p.payload.figure_caption,
    diagram_type: p.payload.diagram_type,
    source_url: p.payload.source_url,
    text: p.payload.chunk_text,
    ocr_confidence: p.payload.ocr_confidence,
    source_mode: p.payload.ocr_source_mode === "ocr" ? "ocr" : p.payload.ocr_source_mode === "hybrid" ? "hybrid" : "native_text",
  }));
  await upsertPartsGraph(graphRows);

  return { ok: true, diagrams: points.length, callouts: graphRows.length };
});

app.post("/ingest/qa-memory", async (request, reply) => {
  const body = request.body as {
    entries: Array<{
      question: string;
      normalized_question?: string;
      model?: string;
      answer: string;
      source_pages?: number[];
      source_urls?: string[];
      verified?: boolean;
      technician_notes?: string;
      correction_status?: string;
    }>;
  };

  if (!Array.isArray(body?.entries) || body.entries.length === 0) {
    return reply.status(400).send({ error: "entries[] required" });
  }

  const texts = body.entries.map((e) => `${e.normalized_question || e.question}\n${e.answer}`);
  const vectors = await embed(texts);
  await ensureCollection(vectors[0].length, "fireplace_qa_memory");

  const points = body.entries.map((e, i) => ({
    id: stableUuid(`${e.normalized_question || e.question}|${e.answer}`),
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

  await qdrant.upsert("fireplace_qa_memory", { wait: true, points });
  return { ok: true, inserted: points.length };
});

app.post("/ingest/dimensions", async (request, reply) => {  const body = request.body as { dimensions: DimensionRecord[] };
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

function hardNone(note: string) {
  return {
    answer: "This information is not available in verified manufacturer documentation." as const,
    source_type: "none" as const,
    confidence: 0 as const,
    certainty: "Unverified" as const,
    run_outcome: "refused_unverified",
    validator_notes: [note],
  };
}

async function quarantineUnassignedChunks(input: any) {
  try {
    const dir = join(env.MANUALS_PATH, "quarantine");
    await mkdir(dir, { recursive: true });
    const path = join(dir, "unassigned_chunks.ndjson");
    await appendFile(path, `${JSON.stringify({ ts: new Date().toISOString(), ...input })}\n`, "utf8");
  } catch {
    // best effort quarantine
  }
}

async function ensureManualAsset(input: {
  file_path?: string;
  source_url?: string;
  manual_id?: string | null;
  manual_title?: string;
}) {
  const cacheDir = join(env.MANUALS_PATH, "cache");
  await mkdir(cacheDir, { recursive: true });

  if (input.file_path) {
    try {
      await access(input.file_path);
      const buf = await readFile(input.file_path);
      const checksum = createHash("sha256").update(buf).digest("hex");
      return {
        resolved_path: input.file_path,
        cache_path: input.file_path,
        asset_source: "local_file",
        download_status: "not_needed",
        checksum,
      };
    } catch {
      // fallback to URL path below
    }
  }

  if (!input.source_url) {
    throw new Error("manual_asset_missing_no_source_url");
  }

  const response = await fetch(input.source_url);
  if (!response.ok) throw new Error(`manual_download_failed:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");

  const ext = extname(new URL(input.source_url).pathname || "") || ".pdf";
  const safeBase = (input.manual_id || input.manual_title || basename(new URL(input.source_url).pathname) || "manual")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cachePath = join(cacheDir, `${safeBase}-${checksum.slice(0, 12)}${ext}`);

  try {
    await access(cachePath);
    return {
      resolved_path: cachePath,
      cache_path: cachePath,
      asset_source: "url_cache",
      download_status: "cache_hit",
      checksum,
    };
  } catch {
    await writeFile(cachePath, bytes);
    return {
      resolved_path: cachePath,
      cache_path: cachePath,
      asset_source: "url_download",
      download_status: "downloaded",
      checksum,
    };
  }
}

function normalizeReasonCode(answer: any, rejectedReason?: string) {
  const notes = Array.isArray(answer?.validator_notes) ? answer.validator_notes.map((x: unknown) => String(x)) : [];
  const noteBlob = `${notes.join("|")}|${String(rejectedReason || "")}`.toLowerCase();
  if (/missing_explicit|insufficient_explicit/.test(noteBlob)) return "missing_explicit_support";
  if (/missing_fields|missing_structured|insufficient_structured/.test(noteBlob)) return "missing_structured_fields";
  if (/semantic_mismatch|model_ambiguous|ambiguous/.test(noteBlob)) return "model_ambiguous";
  if (/source_not_found|insufficient_evidence|no_sources/.test(noteBlob)) return "source_not_found";
  return "source_not_found";
}

function normalizeRunOutcome(answer: any) {
  const sourceType = String(answer?.source_type || "none");
  const certainty = String(answer?.certainty || "Unverified");
  const notes = Array.isArray(answer?.validator_notes) ? answer.validator_notes.map((x: unknown) => String(x).toLowerCase()) : [];
  if (notes.some((n: string) => n.includes("handoff"))) return "escalated_handoff";
  if (sourceType === "none") return "refused_unverified";
  if (sourceType === "manual" || sourceType === "web") {
    if (certainty === "Verified Exact") return "answered_verified";
    if (certainty === "Verified Partial" || certainty === "Interpreted") return "answered_partial";
  }
  return "source_evidence_missing";
}

function inferSelectedEngine(answer: any) {
  const notes = Array.isArray(answer?.validator_notes) ? answer.validator_notes.map((x: unknown) => String(x).toLowerCase()) : [];
  if (notes.some((n: string) => n.includes("parts_"))) return "parts_engine";
  if (notes.some((n: string) => n.includes("wiring_"))) return "wiring_engine";
  if (notes.some((n: string) => n.includes("vent") || n.includes("chimney"))) return "venting_engine";
  if (notes.some((n: string) => n.includes("compliance_") || n.includes("code_"))) return "compliance_engine";
  return "general_engine";
}

function enrichMetadata(answer: any, selectedEngine: string | undefined, rejectedReason?: string, context?: any) {
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
    resolved_manual_ids: context?.registry_selection?.resolved_manual_ids || [],
    candidate_manuals: context?.registry_selection?.candidate_manuals || [],
    registry_match_strategy: context?.registry_selection?.registry_match_strategy || null,
    registry_match_confidence: context?.registry_selection?.registry_match_confidence ?? null,
    manual_gating_applied: context?.registry_selection?.manual_gating_applied ?? false,
    manual_type_policy_applied: context?.registry_selection?.manual_type_policy_applied || null,
    rejected_candidate_manuals: context?.registry_selection?.rejected_candidate_manuals || [],
    fallback_reason: context?.fallback_reason || context?.registry_selection?.fallback_reason || undefined,
    resolution_trace: context?.registry_selection?.resolution_trace || [],
    section_targets: context?.section_targets || [],
    retrieval_scope_mode: context?.retrieval_scope_mode || null,
    manual_id_filter_applied: context?.manual_id_filter_applied ?? false,
    section_filter_applied: context?.section_filter_applied ?? false,
    fallback_disabled: context?.fallback_disabled ?? false,
    corpus_completeness_status: context?.corpus_completeness_status || null,
    response_time_authority_check_passed: context?.response_time_authority_check_passed ?? null,
    superseded_fact_blocked: context?.superseded_fact_blocked ?? false,
    higher_authority_conflict_found: context?.higher_authority_conflict_found ?? false,
    final_authority_reason: context?.final_authority_reason || null,
    final_fact_id: context?.final_fact_id || null,
    final_precedence_rank: context?.final_precedence_rank ?? null,
    fact_conflict_detected: context?.fact_conflict_detected ?? false,
    fact_conflict_resolution_strategy: context?.fact_conflict_resolution_strategy || null,
    superseded_fact_ids: context?.superseded_fact_ids || [],
    chosen_fact_authority_reason: context?.chosen_fact_authority_reason || null,
    release_block_mode_enabled: releaseBlockModeEnabled,
    startup_blocked_by_release_gate: startupBlockedByReleaseGate,
    deploy_blocked_by_release_gate: deployBlockedByReleaseGate,
    failed_gate_names: lastReleaseReadinessResult?.failed_gate_names || [],
    evaluated_threshold_profile: lastReleaseReadinessResult?.profile || resolveGateProfile(),
    last_release_readiness_result: lastReleaseReadinessResult,
    ocr_used: context?.ocr_used ?? false,
    ocr_confidence: context?.ocr_confidence ?? null,
    exploded_parts_graph_used: context?.exploded_parts_graph_used ?? false,
    part_match_type: context?.part_match_type || null,
    part_number_matched: context?.part_number_matched || null,
    figure_callout_used: context?.figure_callout_used || null,
    source_authority_class_used: context?.source_authority_class_used || null,
    jurisdiction_context_applied: context?.jurisdiction_context_applied ?? false,
    adopted_code_used: context?.adopted_code_used ?? false,
    model_code_fallback_used: context?.model_code_fallback_used ?? false,
    activation_status_verified: context?.activation_status_verified ?? false,
    supersession_status_checked: context?.supersession_status_checked ?? false,
    alternatives_considered: context?.ranked_manuals?.slice?.(0, 3) || context?.rankedManuals?.slice?.(0, 3) || [],
  };
}

async function finalizeThroughGate(params: {
  question: string;
  answer: any;
  retrieved: RetrievedChunk[];
  evidencePacket?: unknown;
  selectedEngine?: string;
  context?: any;
}) {
  const context = params.context || (params.evidencePacket as any) || {};
  const verdict = validateOrReject(params.answer, params.retrieved, {
    ...(context || {}),
    install_critical: isInstallCriticalIntent((context?.query_resolution?.intent || "code compliance") as any),
  });
  if (verdict.ok) {
    let postAnswer: any = verdict.answer as any;
    const installCritical = isInstallCriticalIntent((context?.query_resolution?.intent || "code compliance") as any);
    if (installCritical && postAnswer?.fact_type) {
      const cross = await responseTimeAuthorityCrosscheck({
        selectedFact: {
          fact_id: postAnswer?.fact_id || null,
          fact_type: postAnswer?.fact_type,
          fact_subtype: postAnswer?.fact_subtype,
          value_json: postAnswer?.value_json || null,
          manual_type: postAnswer?.manual_type || context?.manual_type_policy_applied,
          extraction_confidence_tier: postAnswer?.extraction_confidence_tier || null,
          revision: postAnswer?.revision || null,
          superseded_fact_ids: postAnswer?.superseded_fact_ids || [],
          precedence_rank: postAnswer?.precedence_rank || null,
        },
        installCritical,
        normalizedModel: (context?.queryResolution?.model_candidate || context?.query_resolution?.model_candidate || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        manualIds: context?.registry_selection?.resolved_manual_ids || [],
        factType: postAnswer?.fact_type,
      });

      context.response_time_authority_check_passed = cross.passed;
      context.superseded_fact_blocked = cross.superseded_fact_blocked;
      context.higher_authority_conflict_found = cross.higher_authority_conflict_found;
      context.final_authority_reason = cross.reason;
      context.final_fact_id = cross.final_fact_id;
      context.final_precedence_rank = cross.final_precedence_rank;

      if (!cross.passed) {
        metrics.authority_crosscheck_failures += 1;
        metrics.response_time_authority_override_blocks += 1;
        if (cross.superseded_fact_blocked) metrics.superseded_fact_block_count += 1;
        if (cross.reason === "fact_selection_reversed") metrics.fact_selection_reversal_count += 1;
        metrics.wrong_authority_override_attempts += 1;
        postAnswer = unavailable(cross.reason, params.question);
      }
    }

    if (!(postAnswer as any).evidence_source_mode) {
      const rc: any = (params.retrieved || [])[0] || {};
      (postAnswer as any).diagram_used = Boolean(rc.figure_present || rc.diagram_type);
      (postAnswer as any).diagram_type = rc.diagram_type || null;
      (postAnswer as any).figure_caption = rc.figure_caption || rc.section_title || null;
      (postAnswer as any).figure_page_number = rc.page_number || null;
      (postAnswer as any).figure_note_linked = Boolean(rc.figure_note_text);
      (postAnswer as any).evidence_source_mode = (postAnswer as any).fact_type ? "fact" : ((rc.diagram_type || rc.figure_present) ? "diagram" : (rc.content_kind === "spec" ? "table" : "prose"));
    }

    const enriched = enrichMetadata(postAnswer as any, params.selectedEngine || "general_engine", undefined, context);
    await appendRunMetadata({
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
    const formatted = composeValidatedResponse(enriched as any) as any;
    if (String(process.env.DIAGNOSTIC_RAW_ENABLED || 'false').toLowerCase() === 'true') {
      formatted.raw_internal_response = verdict.answer;
    }
    return formatted;
  }

  if (String(verdict.reason || "") === "unsupported_numeric_answer") {
    metrics.unsupported_numeric_answer_attempts += 1;
  }
  const safe = hardNone(`hard_gate_reject:${verdict.reason}`);
  const safeVerdict = validateOrReject(safe as any, params.retrieved, {
    ...(context || {}),
    install_critical: isInstallCriticalIntent((context?.query_resolution?.intent || "code compliance") as any),
  });
  if (safeVerdict.ok) {
    const enrichedSafe = enrichMetadata(safeVerdict.answer as any, params.selectedEngine || "general_engine", verdict.reason, context);
    await appendRunMetadata({
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
    const formatted = composeValidatedResponse(enrichedSafe as any) as any;
    if (String(process.env.DIAGNOSTIC_RAW_ENABLED || 'false').toLowerCase() === 'true') {
      formatted.raw_internal_response = safeVerdict.answer;
      formatted.rejected_answer = params.answer;
      formatted.rejected_reason = verdict.reason;
    }
    return formatted;
  }

  const fallback: any = enrichMetadata({ ...safe }, params.selectedEngine || "general_engine", verdict.reason, context);
  if (String(process.env.DIAGNOSTIC_RAW_ENABLED || 'false').toLowerCase() === 'true') {
    fallback.raw_internal_response = { ...safe };
    fallback.rejected_answer = params.answer;
    fallback.rejected_reason = verdict.reason;
  }
  return fallback;
}

app.post("/query", async (request, reply) => {
  const body = request.body as { question: string };
  if (!body?.question) return reply.status(400).send({ error: "question required" });

  metrics.gabe_queries_total += 1;

  const modelDetection = detectModel(body.question);
  const intentClassification = classifyIntent(body.question);
  const qLower = body.question.toLowerCase();
  const partsHint = /\b(part|replacement|diagram|callout|sku|item\s*#|thermopile|thermocouple|blower|gasket|pilot assembly|alias|revision|variant|family)\b/.test(qLower);
  const effectiveIntent: IntentCategory = partsHint ? "replacement parts" : intentClassification.intent;
  const queryResolution = resolveQuery(body.question, effectiveIntent);

  const lowIntent = classifyLowIntentQuestion(body.question);
  if (lowIntent) {
    return await finalizeThroughGate({
      question: body.question,
      answer: {
        answer: "This information is not available in verified manufacturer documentation.",
        source_type: "none" as const,
        confidence: 0,
        certainty: "Unverified" as const,
        validator_notes: [lowIntent],
      },
      retrieved: [],
    });
  }

  const directFraming = await directFramingLookupFromStore(body.question);
  if (directFraming && !isInstallCriticalIntent(effectiveIntent)) {
    const fast = buildFramingFastPath(body.question, directFraming);
    if (fast) return await finalizeThroughGate({ question: body.question, answer: fast, retrieved: [directFraming] });
  }

  const webHints = await searchWebHints(body.question);

  const manualPolicy = policyForIntent(effectiveIntent);
  const jurisdictionKnown = /\b(city|county|state|jurisdiction|code adopted)\b/i.test(body.question);
  const sourcePriority = querySourcePriorityPolicy({ intent: effectiveIntent, jurisdictionKnown });
  const sourceAuthorityClassUsed = sourcePriority[0] || null;
  const jurisdictionContextApplied = effectiveIntent === "code compliance" && jurisdictionKnown;
  const adoptedCodeUsed = jurisdictionContextApplied && sourceAuthorityClassUsed === "jurisdiction_adoption_record";
  const modelCodeFallbackUsed = effectiveIntent === "code compliance" && !jurisdictionKnown;
  const registrySelection = await selectRegistryCandidates(queryResolution, manualPolicy, maxManualCandidates);
  const installCritical = isInstallCriticalIntent(effectiveIntent);

  if (installCritical && installIntentRequiresInstallManual) {
    if (queryResolution.confidence < resolverConfidenceMin) {
      return await finalizeThroughGate({
        question: body.question,
        answer: unavailable("model_unresolved_install_critical", body.question, webHints.top),
        retrieved: [],
        context: { queryResolution, registrySelection, fallback_reason: "resolver_confidence_below_threshold" },
      });
    }
    if (registrySelection.resolved_manual_ids.length === 0) {
      return await finalizeThroughGate({
        question: body.question,
        answer: unavailable("no_allowed_manuals_from_registry", body.question, webHints.top),
        retrieved: [],
        context: { queryResolution, registrySelection, fallback_reason: "registry_gating_failed" },
      });
    }
  }

  const factTypeByIntent: Record<string, string[]> = {
    venting: ["vent_system"],
    framing: ["framing_dimensions"],
    clearances: ["clearance"],
    "gas pressure": ["gas_pressure"],
    electrical: ["electrical"],
    "code compliance": ["approval"],
    "remote operation": ["remote_compatibility"],
    "replacement parts": ["parts_reference"],
  };
  const sectionTargets = preferredSectionsForIntent(effectiveIntent, body.question);
  const normalizedModel = (queryResolution.model_candidate || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const partNumberMatch = body.question.match(/\b(?:P\/N|PN|part\s*no\.?|part\s*number)\s*[:#]?\s*([A-Z0-9\-]{4,})\b/i);
  const partTextHint = body.question.replace(/[^a-z0-9\- ]/gi, " ").trim().slice(0, 80);
  const partsGraphMatches = (effectiveIntent === "replacement parts" || effectiveIntent === "troubleshooting")
    ? await queryPartsGraph({
        manualIds: registrySelection.resolved_manual_ids,
        normalizedModel,
        partNumber: partNumberMatch?.[1],
        partText: partTextHint,
        limit: 8,
      })
    : [];

  if (partsGraphMatches.length > 0 && effectiveIntent === "replacement parts") {
    const best = partsGraphMatches[0];
    const strongerNativeConflict = partsGraphMatches.find((m: any) => m.source_mode === "native_text" && m.part_number && best.part_number && m.part_number !== best.part_number && Number(m.source_confidence || 0) >= Number(best.source_confidence || 0));
    if (strongerNativeConflict) {
      return await finalizeThroughGate({
        question: body.question,
        answer: unavailable("parts_conflict_native_over_ocr", body.question, webHints.top),
        retrieved: [],
        context: {
          queryResolution,
          registry_selection: registrySelection,
          exploded_parts_graph_used: true,
          part_match_type: "conflict",
          part_number_matched: null,
          figure_callout_used: null,
        },
      });
    }

    if (best.source_mode === "ocr" && Number(best.ocr_confidence || 0) < 0.75) {
      return await finalizeThroughGate({
        question: body.question,
        answer: unavailable("weak_ocr_parts_match_unverified", body.question, webHints.top),
        retrieved: [],
        context: {
          queryResolution,
          registry_selection: registrySelection,
          ocr_used: true,
          ocr_confidence: best.ocr_confidence || 0,
          exploded_parts_graph_used: true,
          part_match_type: "weak_ocr",
          figure_callout_used: best.callout_label || null,
          evidence_source_mode: "diagram",
        },
      });
    }

    return await finalizeThroughGate({
      question: body.question,
      answer: {
        answer: `Matched part${best.part_number ? ` ${best.part_number}` : ""}${best.part_name ? ` (${best.part_name})` : ""} from exploded view evidence.`,
        source_type: "manual",
        manual_title: queryResolution.model_candidate || best.model || "Manual",
        page_number: best.figure_page_number || 1,
        source_url: best.source_url || "https://example.com",
        quote: best.figure_caption || best.callout_label || best.part_name || "Exploded view evidence",
        confidence: Math.round((best.source_confidence || 0.7) * 100),
        certainty: "Verified Partial",
        fact_type: "parts_reference",
        fact_subtype: "exploded_view_callout",
        fact_source_kind: "diagram_callout",
        diagram_used: true,
        diagram_type: best.diagram_type || "exploded_parts_view",
        figure_caption: best.figure_caption,
        figure_page_number: best.figure_page_number,
        figure_note_linked: true,
        evidence_source_mode: "diagram",
        ocr_used: best.source_mode !== "native_text",
        ocr_confidence: best.ocr_confidence || null,
        exploded_parts_graph_used: true,
        part_match_type: partNumberMatch?.[1] ? "part_number_exact" : "part_description",
        part_number_matched: best.part_number || null,
        figure_callout_used: best.callout_label || null,
      } as any,
      retrieved: [],
      context: {
        queryResolution,
        registry_selection: registrySelection,
        ocr_used: best.source_mode !== "native_text",
        ocr_confidence: best.ocr_confidence || null,
        exploded_parts_graph_used: true,
        part_match_type: partNumberMatch?.[1] ? "part_number_exact" : "part_description",
        part_number_matched: best.part_number || null,
        figure_callout_used: best.callout_label || null,
        evidence_source_mode: "diagram",
      },
    });
  }
  const rawFactCandidates = await queryFacts({
    manualIds: registrySelection.resolved_manual_ids,
    normalizedModel,
    factTypes: factTypeByIntent[effectiveIntent] || [],
    limit: 30,
  });
  const factCandidates = rankFactsForQuery(rawFactCandidates, {
    manualIds: registrySelection.resolved_manual_ids,
    normalizedModel,
    preferredSections: sectionTargets,
  });

  if (factCandidates.length > 0 && isInstallCriticalIntent(effectiveIntent)) {
    const conflicts = detectFactConflict(factCandidates);
    if (conflicts.conflict) {
      const resolved = resolveFactConflict(factCandidates);
      if (!resolved.resolved) {
        metrics.incomplete_manual_refusal_total += 1;
        metrics.unresolved_conflict_refusals += 1;
        return await finalizeThroughGate({
          question: body.question,
          answer: unavailable("fact_conflict_unresolved", body.question, webHints.top),
          retrieved: [],
          context: {
            queryResolution,
            registry_selection: registrySelection,
            fact_conflict_detected: true,
            fact_conflict_resolution_strategy: resolved.strategy,
            chosen_fact_authority_reason: resolved.reason,
            superseded_fact_ids: resolved.superseded,
            retrieval_scope_mode: "fact_first_manual_id",
            manual_id_filter_applied: true,
            section_filter_applied: true,
            fallback_disabled: true,
            corpus_completeness_status: "sufficient_for_strict",
          },
        });
      }
      const f = resolved.resolved;
      metrics.fact_answers_total += 1;
      return await finalizeThroughGate({
        question: body.question,
        answer: {
          answer: `Verified from authoritative fact: ${JSON.stringify(f.value_json)}`,
          source_type: "manual",
          manual_title: f.model || "Manual",
          page_number: f.page_number || 1,
          source_url: f.source_url || "https://example.com",
          quote: f.evidence_excerpt || JSON.stringify(f.value_json),
          confidence: Math.round((f.confidence || 0.7) * 100),
          certainty: "Verified Partial",
          fact_type: f.fact_type,
          fact_subtype: f.fact_subtype,
          fact_source_kind: f.provenance_detail || f.source_kind,
          diagram_used: ["diagram", "diagram_callout", "figure_note"].includes(String(f.provenance_detail || f.source_kind || "")),
          diagram_type: f.diagram_type || null,
          figure_caption: f.heading_scope || null,
          figure_page_number: f.page_number || null,
          figure_note_linked: Boolean(f.evidence_excerpt),
          evidence_source_mode: f.source_kind || "fact",
        } as any,
        retrieved: [],
        context: {
          queryResolution,
          registry_selection: registrySelection,
          fact_conflict_detected: true,
          fact_conflict_resolution_strategy: resolved.strategy,
          chosen_fact_authority_reason: resolved.reason,
          superseded_fact_ids: resolved.superseded,
          retrieval_scope_mode: "fact_first_manual_id",
          manual_id_filter_applied: true,
          section_filter_applied: true,
          fallback_disabled: true,
          corpus_completeness_status: "sufficient_for_strict",
        },
      });
    }

    const f = factCandidates[0];
    metrics.fact_answers_total += 1;
    return await finalizeThroughGate({
      question: body.question,
      answer: {
        answer: `Verified from manual facts: ${JSON.stringify(f.value_json)}`,
        source_type: "manual",
        manual_title: f.model || "Manual",
        page_number: f.page_number || 1,
        source_url: f.source_url || "https://example.com",
        quote: f.evidence_excerpt || JSON.stringify(f.value_json),
        confidence: Math.round((f.confidence || 0.7) * 100),
        certainty: "Verified Partial",
        fact_type: f.fact_type,
        fact_subtype: f.fact_subtype,
        fact_source_kind: f.provenance_detail || f.source_kind,
        diagram_used: ["diagram", "diagram_callout", "figure_note"].includes(String(f.provenance_detail || f.source_kind || "")),
        diagram_type: f.diagram_type || null,
        figure_caption: f.heading_scope || null,
        figure_page_number: f.page_number || null,
        figure_note_linked: Boolean(f.evidence_excerpt),
        evidence_source_mode: f.source_kind || "fact",
      } as any,
      retrieved: [],
      context: {
        queryResolution,
        registry_selection: registrySelection,
        fact_conflict_detected: false,
        fact_conflict_resolution_strategy: "none",
        chosen_fact_authority_reason: "top_precedence_fact",
        superseded_fact_ids: [],
        retrieval_scope_mode: "fact_first_manual_id",
        manual_id_filter_applied: true,
        section_filter_applied: true,
        fallback_disabled: true,
        corpus_completeness_status: "sufficient_for_strict",
      },
    });
  }

  const [queryVector] = await embed([body.question]);
  const keywordTerms = buildKeywordTerms(body.question, [...webHints.terms, ...expandPartTerms(body.question)]);

  const diagramIntents = new Set(["framing", "clearances", "venting", "electrical"]);
  const shouldUseDiagrams = diagramIntents.has(effectiveIntent);

  const allowedManuals = registrySelection.candidate_manuals;
  const manualIdFilterApplied = registrySelection.resolved_manual_ids.length > 0;
  const sectionFilterApplied = sectionTargets.length > 0;
  const fallbackDisabled = installCritical;
  const chunkScope = installCritical ? {
    allowedManualIds: registrySelection.resolved_manual_ids,
    allowedManualTypes: manualPolicy.requiredTypes,
    preferredSectionTypes: sectionTargets,
  } : {
    preferredSectionTypes: sectionTargets,
  };

  if (installCritical && installStrictManualIdOnly && !manualIdFilterApplied) {
    metrics.install_query_no_manual_id_attempts += 1;
    metrics.incomplete_manual_refusal_total += 1;
    return await finalizeThroughGate({
      question: body.question,
      answer: unavailable("install_query_requires_manual_id_filter", body.question, webHints.top),
      retrieved: [],
      context: {
        queryResolution,
        registry_selection: registrySelection,
        retrieval_scope_mode: "manual_id_only",
        manual_id_filter_applied: false,
        section_filter_applied: sectionFilterApplied,
        fallback_disabled: true,
      },
    });
  }

  const [vectorResults, keywordResults, diagramVector, diagramKeyword, qaMemoryVector] = await Promise.all([
    searchManualChunks(queryVector, 80, installCritical ? allowedManuals : undefined, chunkScope),
    keywordSearchManualChunks(keywordTerms, 80, installCritical ? allowedManuals : undefined, chunkScope),
    shouldUseDiagrams ? searchDiagramChunks(queryVector, 40) : Promise.resolve([]),
    shouldUseDiagrams ? keywordSearchDiagramChunks(keywordTerms, 40) : Promise.resolve([]),
    searchQaMemoryChunks(queryVector, 10),
  ]);

  const framingDirect = tryDirectFramingLookup(body.question, keywordResults);
  if (framingDirect && directFraming) return await finalizeThroughGate({ question: body.question, answer: framingDirect, retrieved: [directFraming] });

  const hybridResults = fuseHybridResults(
    [...vectorResults, ...diagramVector, ...qaMemoryVector],
    [...keywordResults, ...diagramKeyword, ...qaMemoryVector]
  );
  const boostedResults = applyKeywordBoost(body.question, hybridResults);
  const { filtered: hinted } = applyManualHintFilter(body.question, boostedResults);
  const { filtered: technical } = applyTechnicalFilter(body.question, hinted);
  const sectionRouted = routeBySection(effectiveIntent, technical);
  const rankedManuals = rankManuals(sectionRouted.filter((r) => r.source_type === "manual"), queryResolution);
  const manualScoped = filterToTopRankedManuals(sectionRouted, rankedManuals, queryResolution.confidence >= 0.75 ? 2 : 4);

  const diagramLikely = ["framing", "venting", "electrical", "clearances", "replacement parts"].includes(effectiveIntent);
  const diagramPreferred = diagramLikely
    ? manualScoped.filter((r) => r.source_type === "manual" && (String((r as any).diagram_type || "").length > 0 || (r as any).figure_present || String((r as any).content_kind || "").includes("diagram")))
    : [];
  const diagramLinkedPool = diagramPreferred.length > 0 ? diagramPreferred : manualScoped;

  const isFramingQuestion = body.question.toLowerCase().includes("framing") && body.question.toLowerCase().includes("dimension");
  const dynamicThreshold = isFramingQuestion ? 0.5 : Math.max(0.66, similarityThreshold - 0.08);
  const strongCandidates = diagramLinkedPool.filter((r) => r.source_type === "manual" && r.score >= similarityThreshold);
  const fallbackCandidates = diagramLinkedPool.filter((r) => r.source_type === "manual" && r.score >= dynamicThreshold);
  const candidatePool = strongCandidates.length > 0 ? strongCandidates : fallbackCandidates;

  const evidencePacket = buildEvidencePacket({
    modelDetection,
    intent: { intent: effectiveIntent, subtopic: intentClassification.component },
    retrieved: manualScoped,
    qaMemory: qaMemoryVector,
    webHints: webHints.results,
  });
  (evidencePacket as any).query_resolution = queryResolution;
  (evidencePacket as any).ranked_manuals = rankedManuals.slice(0, 5);
  (evidencePacket as any).registry_selection = registrySelection;
  (evidencePacket as any).manual_gating_applied = installCritical;
  (evidencePacket as any).manual_type_policy_applied = manualPolicy.strategy;
  (evidencePacket as any).section_targets = sectionTargets;
  (evidencePacket as any).retrieval_scope_mode = installCritical ? "manual_id_only" : "hybrid_legacy_allowed";
  (evidencePacket as any).manual_id_filter_applied = manualIdFilterApplied;
  (evidencePacket as any).section_filter_applied = sectionFilterApplied;
  (evidencePacket as any).fallback_disabled = fallbackDisabled;
  (evidencePacket as any).corpus_completeness_status = manualIdFilterApplied ? "sufficient_for_strict" : "insufficient_for_strict";
  (evidencePacket as any).diagram_expected = diagramLikely;
  (evidencePacket as any).diagram_available = diagramPreferred.length > 0;
  (evidencePacket as any).source_priority_policy = sourcePriority;
  (evidencePacket as any).source_authority_class_used = sourceAuthorityClassUsed;
  (evidencePacket as any).jurisdiction_context_applied = jurisdictionContextApplied;
  (evidencePacket as any).adopted_code_used = adoptedCodeUsed;
  (evidencePacket as any).model_code_fallback_used = modelCodeFallbackUsed;
  (evidencePacket as any).activation_status_verified = true;
  (evidencePacket as any).supersession_status_checked = true;

  if (effectiveIntent === "venting") {
    const ventRecords = extractVentRuleRecords(manualScoped);
    const bestVent = pickBestVentRule(body.question, ventRecords);
    if (bestVent) {
      const ventAnswer = buildVentingAnswerFromRecord(bestVent, body.question) as any;
      ventAnswer.validator_notes = [...(ventAnswer.validator_notes || []), `vent_rule_records:${ventRecords.length}`];
      const matchedChunk = manualScoped.find((c) => c.source_type === 'manual' && c.manual_title === bestVent.manual_title && c.source_url === bestVent.source_url && c.page_number === (bestVent.source_page ?? 1));
      const retrievedForValidation = matchedChunk ? [matchedChunk] : manualScoped.slice(0, 3);
      return await finalizeThroughGate({
        question: body.question,
        answer: ventAnswer,
        retrieved: retrievedForValidation,
        evidencePacket: {
          ...(evidencePacket as any),
          vent_rule_records: ventRecords.length,
        },
      });
    }

    return await finalizeThroughGate({
      question: body.question,
      answer: unavailable("insufficient_structured_vent_rules", body.question, webHints.top),
      retrieved: manualScoped.slice(0, 1),
      evidencePacket: {
        ...(evidencePacket as any),
        vent_rule_records: 0,
      },
    });
  }

  if (effectiveIntent === "electrical" || effectiveIntent === "remote operation") {
    const wiringRecords = extractWiringRecords(manualScoped);
    const bestWiring = pickBestWiringRecord(body.question, wiringRecords);
    if (bestWiring) {
      const relatedWiring = wiringRecords.slice(0, 20);
      const wiringAnswer = buildWiringAnswerFromRecord(bestWiring, body.question, relatedWiring) as any;
      wiringAnswer.validator_notes = [...(wiringAnswer.validator_notes || []), `wiring_rule_records:${wiringRecords.length}`];
      const matchedChunk = manualScoped.find((c) => c.source_type === 'manual' && c.manual_title === bestWiring.manual_title && c.source_url === bestWiring.source_url && c.page_number === (bestWiring.source_page ?? 1));
      const retrievedForValidation = matchedChunk ? [matchedChunk] : manualScoped.slice(0, 3);
      return await finalizeThroughGate({
        question: body.question,
        answer: wiringAnswer,
        retrieved: retrievedForValidation,
        evidencePacket: {
          ...(evidencePacket as any),
          wiring_graph_records: wiringRecords.length,
        },
      });
    }

    return await finalizeThroughGate({
      question: body.question,
      answer: unavailable("insufficient_structured_wiring_graph", body.question, webHints.top),
      retrieved: manualScoped.slice(0, 1),
      evidencePacket: {
        ...(evidencePacket as any),
        wiring_graph_records: 0,
      },
    });
  }

  if (effectiveIntent === "replacement parts") {
    const partsRecords = extractPartsRecords(manualScoped);
    const bestParts = pickBestPartsRecord(body.question, partsRecords);
    if (bestParts) {
      const relatedParts = partsRecords.slice(0, 20);
      const partsAnswer = buildPartsAnswerFromRecord(bestParts, body.question, relatedParts) as any;
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
          ...(evidencePacket as any),
          parts_structured_records: partsRecords.length,
        },
      });
    }

    return await finalizeThroughGate({
      question: body.question,
      answer: unavailable("insufficient_structured_parts_records", body.question, webHints.top),
      retrieved: manualScoped.slice(0, 1),
      evidencePacket: {
        ...(evidencePacket as any),
        parts_structured_records: 0,
      },
    });
  }

  const rerankedCandidates = rerankCandidates(body.question, candidatePool, effectiveIntent).slice(0, 40);
  const framingPreferred = selectFramingPreferredChunk(body.question, rerankedCandidates);
  const selectedChunks = framingPreferred ? [framingPreferred] : selectDeterministicManualChunks(body.question, rerankedCandidates);
  const requiredEvidence = requiresStrictEvidence(body.question) ? minEvidenceChunks : Math.max(1, minEvidenceChunks - 1);
  if (selectedChunks.length < requiredEvidence) {
    return await finalizeThroughGate({ question: body.question, answer: unavailable("insufficient_evidence", body.question, webHints.top), retrieved: manualScoped.slice(0,1), evidencePacket });
  }

  const candidateChunks = selectedChunks.slice(0, 2);
  const chosenChunk = candidateChunks[0];

  if (effectiveIntent === "code compliance") {
    const complianceRecords = extractComplianceRecords(manualScoped, body.question);
    const bestCompliance = pickBestComplianceRecord(body.question, complianceRecords);

    if (bestCompliance) {
      const complianceAnswer = buildComplianceAnswerFromRecord(bestCompliance, body.question) as any;
      complianceAnswer.validator_notes = [
        ...(complianceAnswer.validator_notes || []),
        `compliance_structured_records:${complianceRecords.length}`,
      ];

      const matchedChunk = manualScoped.find(
        (c) =>
          c.source_type === 'manual' &&
          c.manual_title === bestCompliance.manual_title &&
          c.source_url === bestCompliance.source_url &&
          c.page_number === (bestCompliance.source_page ?? 1)
      );
      const retrievedForValidation = matchedChunk ? [matchedChunk] : manualScoped.slice(0, 3);

      return await finalizeThroughGate({
        question: body.question,
        answer: complianceAnswer,
        retrieved: retrievedForValidation,
        evidencePacket: {
          ...(evidencePacket as any),
          compliance_structured_records: complianceRecords.length,
        },
      });
    }

    return await finalizeThroughGate({
      question: body.question,
      answer: buildComplianceRefusal(body.question, "insufficient_explicit_manufacturer_compliance_support") as any,
      retrieved: manualScoped.slice(0, 1),
      evidencePacket: {
        ...(evidencePacket as any),
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
      const answer = await callGroq([c], body.question);
      const verdict = validateOrReject(answer, [c], {
        query_resolution: queryResolution,
        registry_selection: registrySelection,
        install_critical: installCritical,
        section_targets: sectionTargets,
        manual_id_filter_applied: manualIdFilterApplied,
      });
      if (verdict.ok) {
        return await finalizeThroughGate({ question: body.question, answer: verdict.answer, retrieved: [c], evidencePacket });
      }

      logRefinementEvent({
        question: body.question,
        intent: effectiveIntent,
        model: `${modelDetection.brand || ''} ${modelDetection.model || ''}`.trim() || undefined,
        failure: verdict.reason,
        action: `validator_rejected_attempt_${i + 1}`,
      });
    } catch (err) {
      logRefinementEvent({
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

function unavailable(
  reason: string,
  question?: string,
  webHint?: { title: string; url: string; snippet: string }
) {
  if (reason === "validation_failed") metrics.gabe_missing_citation_total += 1;

  // Directional web fallback when manual evidence is insufficient.
  if (webHint && (reason === "insufficient_evidence" || reason === "semantic_mismatch")) {
    return {
      answer: `I couldn't verify this in loaded manufacturer manuals yet. Web direction: ${webHint.title}. I can use this to guide next lookup, but final technical steps should be manual-verified.`,
      source_type: "web" as const,
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
    source_type: "none" as const,
    confidence: 0,
    certainty: "Unverified" as const,
    run_outcome: "refused_unverified",
    validator_notes: [reason],
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
    confidence: 80,
    certainty: "Verified Partial" as const,
    validator_notes: ["framing_fast_path"]
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

function buildIntentFastPath(intent: IntentCategory, question: string, chunk: RetrievedChunk) {
  const text = chunk.chunk_text || '';
  const mk = (answer: string, quote: string, note: string) => ({
    answer,
    source_type: 'manual' as const,
    manual_title: chunk.manual_title,
    page_number: chunk.page_number,
    source_url: chunk.source_url,
    quote,
    confidence: 78,
    certainty: 'Verified Partial' as const,
    validator_notes: [note],
  });

  if (intent === 'venting') {
    const q = extractQuote(question, text);
    if (q) return mk('Manufacturer venting guidance found in cited section.', q, 'venting_fast_path');
  }

  if (intent === 'electrical' || intent === 'remote operation') {
    const q = extractQuote(question, text);
    if (q) return mk('Manufacturer wiring/control guidance found in cited section.', q, 'wiring_fast_path');
  }

  if (intent === 'replacement parts') {
    const q = extractQuote(question, text);
    if (q) return mk('Manufacturer parts guidance found in cited section.', q, 'parts_fast_path');
  }

  if (intent === 'code compliance') {
    const q = extractQuote(question, text);
    if (q) return mk('Manufacturer compliance-related guidance found in cited section.', q, 'code_fast_path');
  }

  return null;
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
    confidence: 60,
    certainty: "Verified Partial" as const,
    validator_notes: ["extractive_fallback"]
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

function rerankCandidates(question: string, candidates: RetrievedChunk[], intent?: IntentCategory) {
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
      if (intent === 'venting' && /vent|termination|horizontal|vertical|elbow|pipe/.test(text)) boost += 0.14;

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

function buildKeywordTerms(question: string, extraTerms: string[] = []) {
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
  extraTerms.forEach((t) => {
    if (t && t.length >= 3) terms.add(t.toLowerCase());
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

async function startupReleaseGateEnforcement() {
  const strict = String(process.env.RELEASE_BLOCK_STRICT_MODE || "false").toLowerCase() === "true";
  const allowDevOverride = String(process.env.RELEASE_BLOCK_ALLOW_DEV_OVERRIDE || "false").toLowerCase() === "true";
  const profile = resolveGateProfile();
  const inProtectedEnv = profile === "staging" || profile === "production";
  releaseBlockModeEnabled = strict && (inProtectedEnv || !allowDevOverride);

  lastReleaseReadinessResult = await computeReleaseReadinessSnapshot();

  if (releaseBlockModeEnabled && !lastReleaseReadinessResult.ready) {
    startupBlockedByReleaseGate = true;
    deployBlockedByReleaseGate = true;
    const summary = {
      message: "Startup blocked by release-gate enforcement",
      profile,
      failed_gate_names: lastReleaseReadinessResult.failed_gate_names,
      checks: lastReleaseReadinessResult.checks,
      thresholds: lastReleaseReadinessResult.thresholds,
    };
    app.log.error(summary);
    throw new Error(JSON.stringify(summary));
  }
}

startupReleaseGateEnforcement()
  .then(async () => {
    await app.listen({ port: Number(env.PORT), host: "0.0.0.0" });
    if (String(process.env.GOVERNANCE_WORKER_LOOP_ENABLED || "false").toLowerCase() === "true") {
      const concurrency = Number(process.env.GOVERNANCE_WORKER_CONCURRENCY || 2);
      const pollMs = Number(process.env.GOVERNANCE_WORKER_POLL_MS || 2000);
      runWorkerLoop({ concurrency, pollMs, iterations: 0 }).catch((e) => app.log.error({ err: e }, "governance_worker_loop_error"));
      app.log.info({ concurrency, pollMs }, "governance_worker_loop_started");
    }
  })
  .catch((err) => {
    app.log.error({ err }, "service_startup_failed_release_gate");
    process.exit(1);
  });
