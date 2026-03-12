alter table fireplace_technical_facts
  add column if not exists extraction_confidence_tier text default 'weak_pattern_match',
  add column if not exists source_authority text default 'unknown',
  add column if not exists precedence_rank int default 0,
  add column if not exists superseded_fact_ids jsonb default '[]'::jsonb,
  add column if not exists heading_scope text,
  add column if not exists provenance_detail text default 'prose';

create index if not exists idx_ftf_authority on fireplace_technical_facts (fact_type, source_authority, precedence_rank);
create index if not exists idx_ftf_conf_tier on fireplace_technical_facts (extraction_confidence_tier, confidence);
