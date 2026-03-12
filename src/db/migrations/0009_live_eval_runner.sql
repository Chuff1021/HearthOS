alter table gabe_eval_runs add column if not exists environment_profile text;
alter table gabe_eval_runs add column if not exists git_commit_sha text;
alter table gabe_eval_runs add column if not exists aggregate_metrics jsonb not null default '{}'::jsonb;
alter table gabe_eval_runs add column if not exists per_category_metrics jsonb not null default '{}'::jsonb;
alter table gabe_eval_runs add column if not exists regression_failures int not null default 0;

create table if not exists gabe_eval_case_results (
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
  created_at timestamptz not null default now()
);
create index if not exists idx_gecr_run_case on gabe_eval_case_results (eval_run_id, case_id);
