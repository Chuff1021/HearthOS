create table if not exists gabe_source_dead_letter_jobs (
  dlq_id text primary key,
  job_id text not null,
  source_id text not null,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists gabe_source_diff_summaries (
  diff_id text primary key,
  source_id text not null,
  snapshot_from_id text,
  snapshot_to_id text,
  summary_json jsonb not null default '{}'::jsonb,
  summary_text text,
  created_at timestamptz not null default now()
);

create table if not exists gabe_source_signed_actions (
  signed_action_id text primary key,
  source_id text not null,
  actor text not null,
  actor_role text not null,
  action text not null,
  payload_hash text not null,
  signature text not null,
  verified boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_gsdl_created on gabe_source_dead_letter_jobs (created_at desc);
create index if not exists idx_gsds_source_created on gabe_source_diff_summaries (source_id, created_at desc);
create index if not exists idx_gssa_source_created on gabe_source_signed_actions (source_id, created_at desc);
