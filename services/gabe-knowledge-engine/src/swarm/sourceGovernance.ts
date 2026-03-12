import postgres from "postgres";
import { stableUuid } from "../ingest/ids";

export const SOURCE_CLASSES = [
  "manufacturer_manual",
  "service_bulletin",
  "parts_list",
  "wiring_diagram",
  "standards_document",
  "code_document",
  "jurisdiction_adoption_record",
  "internal_sop",
  "training_reference",
] as const;

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
  return sql;
}

export async function ensureSourceGovernanceTables() {
  const s = db();
  if (!s) return;
  await s`create table if not exists gabe_source_registry (
      source_id text primary key,
      source_type text not null,
      manufacturer text,
      publisher text,
      title text not null,
      model text,
      family text,
      size text,
      document_kind text,
      revision text,
      publication_date date,
      effective_date date,
      jurisdiction_scope text,
      source_url text not null,
      checksum text,
      ingest_status text not null default 'discovered',
      confidence double precision not null default 0,
      supersedes_source_id text,
      superseded_by_source_id text,
      last_checked_at timestamptz,
      next_recheck_at timestamptz,
      activation_status text not null default 'pending_review',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now())`;

  await s`create table if not exists gabe_source_review_queue (
      queue_id text primary key,
      source_id text not null,
      reason text not null,
      severity text not null default 'medium',
      status text not null default 'open',
      assigned_to text,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now())`;

  await s`create table if not exists gabe_jurisdiction_registry (
      jurisdiction_id text primary key,
      country text,
      state text,
      county text,
      city text,
      service_area text,
      adopted_code_family text,
      adopted_code_edition text,
      effective_date date,
      reference_source_id text,
      confidence double precision not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now())`;
}

export async function upsertDiscoveredSource(input: any) {
  const s = db();
  if (!s) return null;
  await ensureSourceGovernanceTables();
  const source_id = input.source_id || stableUuid(`${input.source_url}|${input.title}|${input.revision || ""}`);

  let activation = "pending_review";
  let queueReason: string | null = null;
  const highRisk = ["standards_document", "code_document", "service_bulletin"].includes(input.source_type);
  if (highRisk || Number(input.confidence || 0) < 0.75 || input.weak_ocr) {
    activation = "pending_review";
    queueReason = highRisk ? "high_risk_source_type" : Number(input.confidence || 0) < 0.75 ? "low_metadata_confidence" : "weak_ocr_document";
  } else {
    activation = "active";
  }

  await s`
    insert into gabe_source_registry (
      source_id, source_type, manufacturer, publisher, title, model, family, size, document_kind,
      revision, publication_date, effective_date, jurisdiction_scope, source_url, checksum,
      ingest_status, confidence, supersedes_source_id, superseded_by_source_id, last_checked_at,
      next_recheck_at, activation_status, updated_at
    ) values (
      ${source_id}, ${input.source_type}, ${input.manufacturer || null}, ${input.publisher || null}, ${input.title}, ${input.model || null}, ${input.family || null}, ${input.size || null}, ${input.document_kind || null},
      ${input.revision || null}, ${input.publication_date || null}, ${input.effective_date || null}, ${input.jurisdiction_scope || null}, ${input.source_url}, ${input.checksum || null},
      ${input.ingest_status || 'discovered'}, ${Number(input.confidence || 0)}, ${input.supersedes_source_id || null}, ${input.superseded_by_source_id || null}, now(),
      ${input.next_recheck_at || null}, ${activation}, now()
    ) on conflict (source_id) do update set
      checksum = excluded.checksum,
      ingest_status = excluded.ingest_status,
      confidence = excluded.confidence,
      last_checked_at = now(),
      next_recheck_at = excluded.next_recheck_at,
      activation_status = excluded.activation_status,
      updated_at = now()`;

  if (queueReason) {
    const queue_id = stableUuid(`${source_id}|${queueReason}`);
    await s`
      insert into gabe_source_review_queue (queue_id, source_id, reason, severity, status, created_at, updated_at)
      values (${queue_id}, ${source_id}, ${queueReason}, 'high', 'open', now(), now())
      on conflict (queue_id) do nothing`;
  }

  return { source_id, activation_status: activation, queued_reason: queueReason };
}

export async function sourceGovernanceDashboard() {
  const s = db();
  if (!s) return null;
  await ensureSourceGovernanceTables();

  const [tot] = await s<any[]>`select count(*)::int as c from gabe_source_registry`;
  const [newDocs] = await s<any[]>`select count(*)::int as c from gabe_source_registry where ingest_status='discovered'`;
  const [changed] = await s<any[]>`select count(*)::int as c from gabe_source_registry where ingest_status='changed'`;
  const [failed] = await s<any[]>`select count(*)::int as c from gabe_source_registry where ingest_status='failed'`;
  const [quar] = await s<any[]>`select count(*)::int as c from gabe_source_registry where activation_status='quarantined'`;
  const [stale] = await s<any[]>`select count(*)::int as c from gabe_source_registry where next_recheck_at is not null and next_recheck_at < now()`;
  const [queue] = await s<any[]>`select count(*)::int as c from gabe_source_review_queue where status='open'`;

  const coverage = await s<any[]>`
    select manufacturer, count(*)::int as docs
    from gabe_source_registry
    group by manufacturer
    order by docs desc
    limit 25`;

  return {
    total_docs: tot?.c || 0,
    new_docs_discovered: newDocs?.c || 0,
    changed_docs: changed?.c || 0,
    failed_ingests: failed?.c || 0,
    quarantined_docs: quar?.c || 0,
    stale_docs: stale?.c || 0,
    open_review_items: queue?.c || 0,
    source_coverage_by_manufacturer: coverage,
  };
}

export function querySourcePriorityPolicy(input: { intent: string; jurisdictionKnown?: boolean }) {
  const i = input.intent;
  if (i === "code compliance") {
    return input.jurisdictionKnown
      ? ["jurisdiction_adoption_record", "code_document", "standards_document"]
      : ["code_document", "standards_document", "manufacturer_manual"];
  }
  if (i === "replacement parts") return ["parts_list", "service_bulletin", "manufacturer_manual"];
  if (["framing", "venting", "clearances", "gas pressure", "electrical", "installation steps"].includes(i)) {
    return ["manufacturer_manual", "wiring_diagram", "service_bulletin"];
  }
  return ["manufacturer_manual", "training_reference", "internal_sop"];
}

export function suggestMissingSourceClasses(question: string) {
  const q = (question || "").toLowerCase();
  const suggestions: string[] = [];
  if (/code|adopted|jurisdiction|nfpa|irc|ifgc/.test(q)) suggestions.push("jurisdiction_adoption_record", "code_document", "standards_document");
  if (/bulletin|update|recall/.test(q)) suggestions.push("service_bulletin");
  if (/part|callout|exploded/.test(q)) suggestions.push("parts_list", "wiring_diagram");
  if (/training|sop/.test(q)) suggestions.push("internal_sop", "training_reference");
  return Array.from(new Set(suggestions));
}
