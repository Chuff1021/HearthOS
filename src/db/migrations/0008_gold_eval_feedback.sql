create table if not exists gabe_feedback_events (
  feedback_id text primary key,
  question text not null,
  answer_excerpt text,
  manufacturer text,
  model text,
  intent text,
  confidence double precision,
  outcome text,
  admin_notes text,
  promote_to_regression boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gfe_outcome_created on gabe_feedback_events (outcome, created_at desc);

create table if not exists gabe_eval_runs (
  run_id text primary key,
  suite_name text not null,
  scorecard_json jsonb not null default '{}'::jsonb,
  total_cases int not null default 0,
  passed_cases int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_ger_suite_created on gabe_eval_runs (suite_name, created_at desc);
