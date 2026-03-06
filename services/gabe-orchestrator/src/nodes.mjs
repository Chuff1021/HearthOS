import postgres from "postgres";

const ENGINE_URL = (process.env.GABE_ENGINE_URL || "http://127.0.0.1:4100").replace(/\/$/, "");
const VALIDATOR_VERSION = process.env.VALIDATOR_VERSION || "v1";

function pushTrace(state, marker) {
  return [...(state.trace || []), marker];
}

function inferIntent(question = "") {
  const q = question.toLowerCase();
  if (/vent|termination|horizontal|vertical|elbow|pipe/.test(q)) return "venting";
  if (/wiring|switch|module|ifc|receiver|transformer|valve|terminal/.test(q)) return "wiring";
  if (/part|sku|replacement|thermopile|thermocouple/.test(q)) return "parts";
  if (/code|permit|compliance|inspection|listed|certified/.test(q)) return "compliance";
  return "general";
}

async function callEngine(question) {
  const r = await fetch(`${ENGINE_URL}/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const text = await r.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { answer: text, source_type: "none", certainty: "Unverified", confidence: 0 }; }
  if (!r.ok) {
    return {
      answer: "Verified source evidence is currently unavailable.",
      source_type: "none",
      certainty: "Unverified",
      confidence: 0,
      no_answer_reason: "source_evidence_missing",
      run_outcome: "source_evidence_missing",
      validator_notes: ["upstream_not_ok"],
    };
  }
  return payload;
}

function withEngine(payload, engine) {
  return { ...payload, selected_engine: `${engine}_engine` };
}

export async function intakeNode(state) {
  return { trace: pushTrace(state, "request_intake") };
}

export async function modelResolverNode(state) {
  return { trace: pushTrace(state, "model_resolver") };
}

export async function intentRouterNode(state) {
  const intent = inferIntent(state.question);
  return { intent, trace: pushTrace(state, `intent_router:${intent}`) };
}

export async function engineSelectorNode(state) {
  const selected_engine = state.intent || "general";
  return { selected_engine, trace: pushTrace(state, `engine_selector:${selected_engine}`) };
}

export async function generalRetrievalNode(state) {
  const payload = withEngine(await callEngine(state.question), "general");
  return { payload, trace: pushTrace(state, "general_retrieval") };
}

export async function ventingEngineNode(state) {
  const payload = withEngine(await callEngine(state.question), "venting");
  return { payload, trace: pushTrace(state, "venting_engine") };
}

export async function wiringEngineNode(state) {
  const payload = withEngine(await callEngine(state.question), "wiring");
  return { payload, trace: pushTrace(state, "wiring_engine") };
}

export async function partsEngineNode(state) {
  const payload = withEngine(await callEngine(state.question), "parts");
  return { payload, trace: pushTrace(state, "parts_engine") };
}

export async function complianceEngineNode(state) {
  const payload = withEngine(await callEngine(state.question), "compliance");
  return { payload, trace: pushTrace(state, "compliance_engine") };
}

export async function validatorNode(state) {
  const p = { ...(state.payload || {}) };
  const certainty = p.certainty || "Unverified";
  const source_type = p.source_type || "none";
  const notes = [...(p.validator_notes || [])];

  if (!p.answer || !p.source_type) {
    p.answer = "This information is not available in verified manufacturer documentation.";
    p.source_type = "none";
    p.certainty = "Unverified";
    p.no_answer_reason = "source_evidence_missing";
    notes.push("validator_missing_required_fields");
  }

  if (!p.run_outcome) {
    if (p.no_answer_reason === "source_evidence_missing" || p.source_type === "none") p.run_outcome = "source_evidence_missing";
    else if (certainty === "Verified Exact") p.run_outcome = "answered_verified";
    else if (certainty === "Verified Partial" || certainty === "Interpreted") p.run_outcome = "answered_partial";
    else p.run_outcome = "refused_unverified";
  }

  p.validator_version = VALIDATOR_VERSION;
  p.validator_notes = [...notes, `validator_outcome:${p.run_outcome}`];
  p.selected_engine = p.selected_engine || `${state.selected_engine}_engine`;

  return {
    payload: p,
    run_outcome: p.run_outcome,
    certainty: p.certainty || certainty,
    trace: pushTrace(state, "validator"),
  };
}

export async function handoffDecisionNode(state) {
  const ro = state.payload?.run_outcome || state.run_outcome;
  const needs_handoff = ["refused_unverified", "escalated_handoff", "source_evidence_missing"].includes(ro);
  return { needs_handoff, trace: pushTrace(state, `handoff_decision:${needs_handoff}`) };
}

export async function responseComposerNode(state) {
  const payload = {
    ...(state.payload || {}),
    selected_engine: state.payload?.selected_engine || `${state.selected_engine}_engine`,
    run_outcome: state.payload?.run_outcome || state.run_outcome,
    certainty: state.payload?.certainty || state.certainty,
    truth_audit_status: state.payload?.truth_audit_status || "pending",
    langgraph_trace: state.trace || [],
  };
  return { payload, trace: pushTrace(state, "response_composer") };
}

export async function runMetadataPersistenceNode(state) {
  if (!process.env.DATABASE_URL) {
    return { trace: pushTrace(state, "run_metadata_persistence:skipped_no_db") };
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  await sql`create table if not exists gabe_run_metadata (id bigserial primary key, ts timestamptz not null default now(), payload jsonb not null)`;
  await sql`insert into gabe_run_metadata (payload) values (${JSON.stringify({
    question: state.question,
    selected_engine: state.payload?.selected_engine,
    certainty: state.payload?.certainty,
    source_type: state.payload?.source_type,
    run_outcome: state.payload?.run_outcome,
    validator_notes: state.payload?.validator_notes || [],
    truth_audit_status: state.payload?.truth_audit_status || "pending",
    langgraph_trace: state.payload?.langgraph_trace || [],
  })}::jsonb)`;
  return { trace: pushTrace(state, "run_metadata_persistence") };
}
