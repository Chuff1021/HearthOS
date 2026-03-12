create table if not exists fireplace_technical_facts (
  fact_id text primary key,
  manual_id text not null,
  manufacturer text,
  model text,
  normalized_model text,
  family text,
  size text,
  manual_type text,
  fact_type text not null,
  fact_subtype text,
  value_json jsonb not null default '{}'::jsonb,
  units text,
  page_number int,
  source_url text,
  evidence_excerpt text,
  confidence double precision not null default 0,
  revision text,
  source_kind text not null default 'prose',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ftf_manual on fireplace_technical_facts (manual_id, fact_type);
create index if not exists idx_ftf_model on fireplace_technical_facts (normalized_model, fact_type);
create index if not exists idx_ftf_page on fireplace_technical_facts (page_number);
