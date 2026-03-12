import postgres from "postgres";

export type TechnicalFact = {
  fact_id: string;
  manual_id: string;
  manufacturer?: string | null;
  model?: string | null;
  normalized_model?: string | null;
  family?: string | null;
  size?: string | null;
  manual_type?: string | null;
  fact_type: string;
  fact_subtype?: string | null;
  value_json: any;
  units?: string | null;
  page_number?: number | null;
  source_url?: string | null;
  evidence_excerpt?: string | null;
  confidence: number;
  revision?: string | null;
  source_kind?: string | null;
  extraction_confidence_tier?: string | null;
  source_authority?: string | null;
  precedence_rank?: number | null;
  superseded_fact_ids?: string[] | null;
  heading_scope?: string | null;
  provenance_detail?: string | null;
};

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
  return sql;
}

export async function ensureFactsTable() {
  const s = db();
  if (!s) return;
  await s`
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
      extraction_confidence_tier text default 'weak_pattern_match',
      source_authority text default 'unknown',
      precedence_rank int default 0,
      superseded_fact_ids jsonb default '[]'::jsonb,
      heading_scope text,
      provenance_detail text default 'prose',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;
}

export async function upsertFacts(facts: TechnicalFact[]) {
  const s = db();
  if (!s || facts.length === 0) return 0;
  await ensureFactsTable();
  for (const f of facts) {
    await s`
      insert into fireplace_technical_facts (
        fact_id, manual_id, manufacturer, model, normalized_model, family, size, manual_type,
        fact_type, fact_subtype, value_json, units, page_number, source_url, evidence_excerpt,
        confidence, revision, source_kind, extraction_confidence_tier, source_authority, precedence_rank,
        superseded_fact_ids, heading_scope, provenance_detail, updated_at
      ) values (
        ${f.fact_id}, ${f.manual_id}, ${f.manufacturer || null}, ${f.model || null}, ${f.normalized_model || null}, ${f.family || null}, ${f.size || null}, ${f.manual_type || null},
        ${f.fact_type}, ${f.fact_subtype || null}, ${JSON.stringify(f.value_json || {})}::jsonb, ${f.units || null}, ${f.page_number || null}, ${f.source_url || null}, ${f.evidence_excerpt || null},
        ${f.confidence || 0}, ${f.revision || null}, ${f.source_kind || 'prose'}, ${f.extraction_confidence_tier || 'weak_pattern_match'}, ${f.source_authority || 'unknown'}, ${f.precedence_rank || 0},
        ${JSON.stringify(f.superseded_fact_ids || [])}::jsonb, ${f.heading_scope || null}, ${f.provenance_detail || 'prose'}, now()
      ) on conflict (fact_id) do update set
        value_json = excluded.value_json,
        units = excluded.units,
        evidence_excerpt = excluded.evidence_excerpt,
        confidence = excluded.confidence,
        extraction_confidence_tier = excluded.extraction_confidence_tier,
        source_authority = excluded.source_authority,
        precedence_rank = excluded.precedence_rank,
        superseded_fact_ids = excluded.superseded_fact_ids,
        heading_scope = excluded.heading_scope,
        provenance_detail = excluded.provenance_detail,
        updated_at = now()`;
  }
  return facts.length;
}

export async function queryFacts(params: { manualIds?: string[]; normalizedModel?: string; factTypes?: string[]; limit?: number; }) {
  const s = db();
  if (!s) return [];
  await ensureFactsTable();
  const rows = await s<any[]>`
    select * from fireplace_technical_facts
    where (${(params.manualIds || []).length} = 0 or manual_id = any(${params.manualIds || []}))
      and (${params.normalizedModel || ''} = '' or normalized_model = ${params.normalizedModel || ''})
      and (${(params.factTypes || []).length} = 0 or fact_type = any(${params.factTypes || []}))
    order by precedence_rank desc, confidence desc, updated_at desc
    limit ${Math.max(1, Math.min(params.limit || 30, 200))}`;
  return rows;
}
