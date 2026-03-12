import postgres from "postgres";
import { stableUuid } from "../ingest/ids";

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
  return sql;
}

export async function ensureFeedbackTables() {
  const s = db(); if (!s) return;
  await s`create table if not exists gabe_feedback_events (
    feedback_id text primary key, question text not null, answer_excerpt text, manufacturer text, model text,
    intent text, confidence double precision, outcome text, admin_notes text, promote_to_regression boolean not null default false,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
  await s`create table if not exists gabe_eval_runs (
    run_id text primary key, suite_name text not null, scorecard_json jsonb not null default '{}'::jsonb,
    total_cases int not null default 0, passed_cases int not null default 0,
    environment_profile text, git_commit_sha text, aggregate_metrics jsonb not null default '{}'::jsonb,
    per_category_metrics jsonb not null default '{}'::jsonb, regression_failures int not null default 0,
    created_at timestamptz not null default now())`;
  await s`create table if not exists gabe_eval_case_results (
    result_id text primary key,
    eval_run_id text not null,
    case_id text not null,
    query text not null,
    actual_response_metadata jsonb not null default '{}'::jsonb,
    pass boolean not null default false,
    failure_reasons jsonb not null default '[]'::jsonb,
    citation_page_ok boolean,
    validator_result text,
    answer_status text,
    runtime_duration_ms int,
    created_at timestamptz not null default now())`;
}

export async function captureFeedback(input: any) {
  const s = db(); if (!s) return null;
  await ensureFeedbackTables();
  const feedback_id = stableUuid(`${input.question}|${Date.now()}`);
  await s`insert into gabe_feedback_events (feedback_id, question, answer_excerpt, manufacturer, model, intent, confidence, outcome, admin_notes, promote_to_regression, created_at, updated_at)
          values (${feedback_id}, ${input.question}, ${input.answer_excerpt || null}, ${input.manufacturer || null}, ${input.model || null}, ${input.intent || null}, ${Number(input.confidence || 0)}, ${input.outcome || null}, ${input.admin_notes || null}, ${Boolean(input.promote_to_regression)}, now(), now())`;
  return { feedback_id };
}

export async function listFeedback(limit = 100) {
  const s = db(); if (!s) return [];
  await ensureFeedbackTables();
  return await s<any[]>`select * from gabe_feedback_events order by created_at desc limit ${Math.max(1, Math.min(limit, 1000))}`;
}

export async function feedbackDashboard() {
  const s = db(); if (!s) return null;
  await ensureFeedbackTables();
  const [unresolved] = await s<any[]>`select count(*)::int as c from gabe_feedback_events where outcome in ('unresolved','not_helpful')`;
  const [low] = await s<any[]>`select count(*)::int as c from gabe_feedback_events where confidence < 0.6`;
  const [promoted] = await s<any[]>`select count(*)::int as c from gabe_feedback_events where promote_to_regression=true`;
  const byIntent = await s<any[]>`select intent, count(*)::int as c from gabe_feedback_events group by intent order by c desc`;
  return {
    unresolved_questions: unresolved?.c || 0,
    low_confidence_answers: low?.c || 0,
    promoted_to_regression: promoted?.c || 0,
    top_failed_question_types: byIntent,
  };
}

export async function recordEvalRun(input: {
  suite_name: string;
  scorecard_json: any;
  total_cases: number;
  passed_cases: number;
  environment_profile?: string;
  git_commit_sha?: string;
  aggregate_metrics?: any;
  per_category_metrics?: any;
  regression_failures?: number;
}) {
  const s = db(); if (!s) return null;
  await ensureFeedbackTables();
  const run_id = stableUuid(`${input.suite_name}|${Date.now()}`);
  await s`insert into gabe_eval_runs (
            run_id, suite_name, scorecard_json, total_cases, passed_cases,
            environment_profile, git_commit_sha, aggregate_metrics, per_category_metrics, regression_failures, created_at)
          values (
            ${run_id}, ${input.suite_name}, ${JSON.stringify(input.scorecard_json)}::jsonb, ${input.total_cases}, ${input.passed_cases},
            ${input.environment_profile || null}, ${input.git_commit_sha || null}, ${JSON.stringify(input.aggregate_metrics || {})}::jsonb, ${JSON.stringify(input.per_category_metrics || {})}::jsonb, ${Number(input.regression_failures || 0)}, now())`;
  return { run_id };
}

export async function recordEvalCaseResults(eval_run_id: string, rows: Array<any>) {
  const s = db(); if (!s) return 0;
  await ensureFeedbackTables();
  for (const r of rows) {
    const result_id = stableUuid(`${eval_run_id}|${r.case_id}|${Date.now()}|${Math.random()}`);
    await s`insert into gabe_eval_case_results (
              result_id, eval_run_id, case_id, query, actual_response_metadata, pass, failure_reasons,
              citation_page_ok, validator_result, answer_status, runtime_duration_ms, created_at)
            values (
              ${result_id}, ${eval_run_id}, ${r.case_id}, ${r.query}, ${JSON.stringify(r.actual_response_metadata || {})}::jsonb,
              ${Boolean(r.pass)}, ${JSON.stringify(r.failure_reasons || [])}::jsonb, ${r.citation_page_ok ?? null}, ${r.validator_result || null},
              ${r.answer_status || null}, ${r.runtime_duration_ms || null}, now())`;
  }
  return rows.length;
}

export async function evalHistory(limit = 50) {
  const s = db(); if (!s) return [];
  await ensureFeedbackTables();
  return await s<any[]>`select run_id, suite_name, total_cases, passed_cases, scorecard_json, environment_profile, git_commit_sha, aggregate_metrics, per_category_metrics, regression_failures, created_at from gabe_eval_runs order by created_at desc limit ${Math.max(1, Math.min(limit, 500))}`;
}

export async function evalTrends(limit = 200) {
  const s = db(); if (!s) return null;
  await ensureFeedbackTables();
  const runs = await s<any[]>`select run_id, suite_name, total_cases, passed_cases, aggregate_metrics, per_category_metrics, regression_failures, created_at from gabe_eval_runs order by created_at asc limit ${Math.max(1, Math.min(limit, 2000))}`;
  return {
    overall_score_over_time: runs.map((r) => ({ t: r.created_at, score: r.total_cases ? r.passed_cases / r.total_cases : 0 })),
    per_category_over_time: runs.map((r) => ({ t: r.created_at, per_category: r.per_category_metrics || {} })),
    refusal_precision_trend: runs.map((r) => ({ t: r.created_at, value: (r.aggregate_metrics || {}).refusal_precision ?? null })),
    citation_presence_trend: runs.map((r) => ({ t: r.created_at, value: (r.aggregate_metrics || {}).citation_page_presence ?? null })),
    regression_failure_trend: runs.map((r) => ({ t: r.created_at, value: r.regression_failures || 0 })),
  };
}