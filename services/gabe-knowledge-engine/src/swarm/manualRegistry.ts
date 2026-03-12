import postgres from "postgres";
import { env } from "../config";
import { QueryResolution } from "./modelResolver";
import { ManualTypePolicy } from "./manualTypePolicy";

export type RegistryManual = {
  manual_id: string;
  manufacturer: string | null;
  brand: string | null;
  model: string | null;
  normalized_model: string | null;
  family: string | null;
  size: string | null;
  fuel_type: string | null;
  appliance_type: string | null;
  manual_type: string | null;
  language: string | null;
  revision: string | null;
  publication_date: string | null;
  source_url: string | null;
  local_file_path: string | null;
  checksum: string | null;
  aliases: any;
  chunk_collection: string | null;
  chunk_namespace: string | null;
  supersedes_manual_id: string | null;
  superseded_by_manual_id: string | null;
  status: string | null;
  metadata_confidence: number | null;
  created_at: string;
  updated_at: string;
};

export type RegistrySelection = {
  resolved_manual_ids: string[];
  candidate_manuals: RegistryManual[];
  rejected_candidate_manuals: Array<{ manual_id: string; reason: string }>;
  registry_match_strategy: string;
  registry_match_confidence: number;
  manual_gating_applied: boolean;
  manual_type_policy_applied: string;
  fallback_reason?: string;
  resolution_trace: string[];
};

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
  return sql;
}

export async function ensureManualRegistryTable() {
  const s = db();
  if (!s) return;
  await s`
    create table if not exists fireplace_manual_registry (
      manual_id text primary key,
      manufacturer text,
      brand text,
      model text,
      normalized_model text,
      family text,
      size text,
      fuel_type text,
      appliance_type text,
      manual_type text,
      language text,
      revision text,
      publication_date date,
      source_url text,
      local_file_path text,
      checksum text,
      aliases jsonb not null default '[]'::jsonb,
      chunk_collection text,
      chunk_namespace text,
      supersedes_manual_id text,
      superseded_by_manual_id text,
      status text not null default 'active',
      metadata_confidence double precision not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;

  await s`create index if not exists idx_fmr_mfg_model_type on fireplace_manual_registry (manufacturer, normalized_model, manual_type)`;
  await s`create index if not exists idx_fmr_family_size on fireplace_manual_registry (family, size)`;
  await s`create index if not exists idx_fmr_status_updated on fireplace_manual_registry (status, updated_at desc)`;
}

function includesNorm(hay: string | null | undefined, needle: string | null | undefined) {
  if (!hay || !needle) return false;
  return hay.toLowerCase().includes(needle.toLowerCase());
}

export async function resolveManualIdForIngest(input: {
  manufacturer?: string;
  model?: string;
  manual_title?: string;
  source_url?: string;
  doc_type?: string;
}) {
  const s = db();
  if (!s) return { manual_id: null as string | null, confidence: 0 };
  await ensureManualRegistryTable();

  const rows = await s<RegistryManual[]>`
    select * from fireplace_manual_registry
    where status='active'
    and (${input.source_url || ''} = '' or source_url = ${input.source_url || ''})
    order by updated_at desc
    limit 50`;

  let best: { row: RegistryManual; score: number } | null = null;
  for (const r of rows) {
    let score = 0;
    if (input.source_url && r.source_url && r.source_url === input.source_url) score += 5;
    if (input.model && r.model && r.model.toLowerCase().includes(input.model.toLowerCase())) score += 3;
    if (input.manufacturer && (r.manufacturer || r.brand || '').toLowerCase().includes(input.manufacturer.toLowerCase())) score += 2;
    if (input.manual_title && r.manual_title && r.manual_title.toLowerCase().includes(input.manual_title.toLowerCase())) score += 2;
    if (input.doc_type && r.manual_type && r.manual_type.toLowerCase().includes(input.doc_type.toLowerCase())) score += 1;
    if (!best || score > best.score) best = { row: r, score };
  }

  if (!best || best.score < 5) return { manual_id: null as string | null, confidence: best ? best.score / 12 : 0 };
  return { manual_id: best.row.manual_id, confidence: Math.min(1, best.score / 12) };
}

export async function selectRegistryCandidates(
  resolution: QueryResolution,
  policy: ManualTypePolicy,
  maxCandidates = 6,
): Promise<RegistrySelection> {
  const s = db();
  const trace: string[] = [];
  if (!s) {
    return {
      resolved_manual_ids: [],
      candidate_manuals: [],
      rejected_candidate_manuals: [],
      registry_match_strategy: "no_db",
      registry_match_confidence: 0,
      manual_gating_applied: false,
      manual_type_policy_applied: policy.strategy,
      fallback_reason: "database_unavailable",
      resolution_trace: ["DATABASE_URL missing"],
    };
  }

  await ensureManualRegistryTable();

  const rows = await s<RegistryManual[]>`
    select * from fireplace_manual_registry
    where status = 'active'
    order by updated_at desc
    limit 5000`;

  const scored = rows.map((r) => {
    let score = 0;
    if (includesNorm(r.manufacturer, resolution.manufacturer_candidate) || includesNorm(r.brand, resolution.manufacturer_candidate)) score += 4;
    if (includesNorm(r.normalized_model, resolution.model_candidate) || includesNorm(r.model, resolution.model_candidate)) score += 5;
    if (includesNorm(r.family, resolution.family_candidate)) score += 2;
    if (resolution.size_candidate && includesNorm(r.size, resolution.size_candidate)) score += 2;
    if (policy.requiredTypes.some((t) => includesNorm(r.manual_type, t))) score += 2;
    if (policy.disallowedPrimaryTypes.some((t) => includesNorm(r.manual_type, t))) score -= 4;
    if ((r.metadata_confidence || 0) < 0.45) score -= 1.2;
    return { r, score };
  }).sort((a, b) => b.score - a.score);

  const selected: RegistryManual[] = [];
  const rejected: Array<{ manual_id: string; reason: string }> = [];
  for (const x of scored) {
    if (selected.length >= maxCandidates) break;
    const mt = (x.r.manual_type || "").toLowerCase();
    if (policy.disallowedPrimaryTypes.some((t) => mt.includes(t))) {
      rejected.push({ manual_id: x.r.manual_id, reason: "disallowed_manual_type" });
      continue;
    }
    if (policy.installCritical && !policy.requiredTypes.some((t) => mt.includes(t))) {
      rejected.push({ manual_id: x.r.manual_id, reason: "manual_type_policy_mismatch" });
      continue;
    }
    if (x.score < Number(env.REGISTRY_MATCH_CONFIDENCE_MIN)) {
      rejected.push({ manual_id: x.r.manual_id, reason: "low_registry_match_score" });
      continue;
    }
    selected.push(x.r);
  }

  const strategy = resolution.model_candidate ? "exact_or_alias_model" : resolution.family_candidate ? "family_size" : "manufacturer_only";
  const confidence = selected.length ? Math.min(1, Math.max(0, (scored[0]?.score || 0) / 12)) : 0;
  trace.push(`strategy:${strategy}`);
  trace.push(`candidates:${selected.length}`);

  return {
    resolved_manual_ids: selected.map((x) => x.manual_id),
    candidate_manuals: selected,
    rejected_candidate_manuals: rejected,
    registry_match_strategy: strategy,
    registry_match_confidence: Number(confidence.toFixed(3)),
    manual_gating_applied: selected.length > 0,
    manual_type_policy_applied: policy.strategy,
    fallback_reason: selected.length ? undefined : "no_registry_candidates",
    resolution_trace: trace,
  };
}
