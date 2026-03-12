create table if not exists gabe_source_worker_jobs (
  job_id text primary key,
  source_id text not null,
  job_type text not null,
  status text not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  next_retry_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gswj_status_retry on gabe_source_worker_jobs (status, next_retry_at, updated_at);

create table if not exists gabe_source_checksum_snapshots (
  snapshot_id text primary key,
  source_id text not null,
  checksum text,
  metadata_hash text,
  observed_at timestamptz not null default now(),
  changed_binary boolean not null default false,
  changed_metadata boolean not null default false,
  revision_hint text,
  notes text
);
create index if not exists idx_gscs_source_observed on gabe_source_checksum_snapshots (source_id, observed_at desc);

create table if not exists gabe_source_supersession_edges (
  edge_id text primary key,
  from_source_id text not null,
  to_source_id text not null,
  relation text not null default 'supersedes',
  confidence double precision not null default 0,
  status text not null default 'proposed',
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gsse_from_to on gabe_source_supersession_edges (from_source_id, to_source_id, status);

create table if not exists gabe_source_activation_audit (
  event_id text primary key,
  source_id text not null,
  event_type text not null,
  actor text,
  action text,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_gsaa_source_created on gabe_source_activation_audit (source_id, created_at desc);
