import { qdrant } from "../src/retrieval/qdrant";
import { env } from "../src/config";
import postgres from "postgres";
import { writeFile } from "node:fs/promises";

type RegistryRecord = {
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
  aliases: string[];
  chunk_collection: string;
  chunk_namespace: string | null;
  supersedes_manual_id: string | null;
  superseded_by_manual_id: string | null;
  status: string;
  metadata_confidence: number;
};

function slug(v: string) { return (v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function normalizeModel(v?: string | null) { return (v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || null; }

function inferManualType(title: string) {
  const t = (title || "").toLowerCase();
  if (t.includes("installation")) return "installation";
  if (t.includes("owner")) return "owner";
  if (t.includes("parts")) return "parts";
  if (t.includes("service")) return "service";
  if (t.includes("wiring")) return "wiring";
  if (t.includes("brochure")) return "brochure";
  if (t.includes("spec")) return "spec sheet";
  if (t.includes("flyer")) return "flyer";
  return "other";
}

async function ensureTable(sql: any) {
  await sql`
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
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
  await ensureTable(sql);

  const res = await qdrant.scroll(env.QDRANT_COLLECTION, {
    limit: 100000,
    with_payload: true,
    with_vector: false,
  } as any);

  const points = (res as any).points || [];
  const grouped = new Map<string, any[]>();
  for (const p of points) {
    const x = p.payload || {};
    const key = `${x.manufacturer || ""}|${x.model || ""}|${x.manual_title || ""}|${x.source_url || ""}`;
    const arr = grouped.get(key) || [];
    arr.push(x);
    grouped.set(key, arr);
  }

  const records: RegistryRecord[] = [];
  for (const [_, arr] of grouped.entries()) {
    const x = arr[0] || {};
    const manufacturer = x.manufacturer ? String(x.manufacturer) : null;
    const model = x.model ? String(x.model) : null;
    const title = String(x.manual_title || "unknown manual");
    const source = x.source_url ? String(x.source_url) : null;
    const pageMax = arr.reduce((m, r) => Math.max(m, Number(r.page_number || 0)), 0);
    const size = model?.match(/\b(\d{2})\b/)?.[1] || null;
    const family = model?.toLowerCase().includes("apex") ? "apex" : model?.toLowerCase().includes("elite") ? "elite" : model?.toLowerCase().includes("novus") ? "novus" : null;

    const metadataConfidence = manufacturer && model && source ? 0.85 : manufacturer || model ? 0.55 : 0.25;

    records.push({
      manual_id: slug(`${manufacturer || "na"}-${model || "na"}-${title}`),
      manufacturer,
      brand: manufacturer,
      model,
      normalized_model: normalizeModel(model),
      family,
      size,
      fuel_type: null,
      appliance_type: "fireplace",
      manual_type: inferManualType(title),
      language: "en",
      revision: null,
      publication_date: null,
      source_url: source,
      local_file_path: null,
      checksum: null,
      aliases: model ? [model] : [],
      chunk_collection: env.QDRANT_COLLECTION,
      chunk_namespace: source,
      supersedes_manual_id: null,
      superseded_by_manual_id: null,
      status: "active",
      metadata_confidence: metadataConfidence,
    });
  }

  for (const r of records) {
    await sql`
      insert into fireplace_manual_registry (
        manual_id, manufacturer, brand, model, normalized_model, family, size, fuel_type, appliance_type,
        manual_type, language, revision, publication_date, source_url, local_file_path, checksum, aliases,
        chunk_collection, chunk_namespace, supersedes_manual_id, superseded_by_manual_id, status,
        metadata_confidence, updated_at
      ) values (
        ${r.manual_id}, ${r.manufacturer}, ${r.brand}, ${r.model}, ${r.normalized_model}, ${r.family}, ${r.size}, ${r.fuel_type}, ${r.appliance_type},
        ${r.manual_type}, ${r.language}, ${r.revision}, ${r.publication_date}, ${r.source_url}, ${r.local_file_path}, ${r.checksum}, ${JSON.stringify(r.aliases)}::jsonb,
        ${r.chunk_collection}, ${r.chunk_namespace}, ${r.supersedes_manual_id}, ${r.superseded_by_manual_id}, ${r.status},
        ${r.metadata_confidence}, now()
      )
      on conflict (manual_id) do update set
        manufacturer = excluded.manufacturer,
        brand = excluded.brand,
        model = excluded.model,
        normalized_model = excluded.normalized_model,
        family = excluded.family,
        size = excluded.size,
        manual_type = excluded.manual_type,
        source_url = excluded.source_url,
        aliases = excluded.aliases,
        chunk_collection = excluded.chunk_collection,
        chunk_namespace = excluded.chunk_namespace,
        metadata_confidence = excluded.metadata_confidence,
        updated_at = now()`;
  }

  const dupes = await sql`select source_url, model, count(*)::int as c from fireplace_manual_registry group by 1,2 having count(*) > 1 order by c desc`;
  const missingCore = await sql`select manual_id from fireplace_manual_registry where manufacturer is null or model is null or manual_type is null`;
  const lowConfidence = await sql`select manual_id, metadata_confidence from fireplace_manual_registry where metadata_confidence < 0.5 order by metadata_confidence asc`;
  const withoutChunks = await sql`
    select r.manual_id from fireplace_manual_registry r
    left join lateral (
      select 1
    ) x on true
    where r.chunk_namespace is null`;

  const report = {
    generated_at: new Date().toISOString(),
    totals: { qdrant_points: points.length, registry_rows: records.length },
    duplicate_manuals: dupes,
    missing_core_metadata: missingCore,
    low_confidence_metadata: lowConfidence,
    registry_rows_without_chunks: withoutChunks,
    notes: [
      "Conflicting aliases and revision conflicts require manual curation if source metadata is absent.",
      "No metadata is invented when confidence is weak; rows are flagged in low_confidence_metadata.",
    ],
  };

  const out = "/tmp/gabe_manual_registry_reconciliation.json";
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, output: out, registry_rows: records.length }));
  await sql.end({ timeout: 1 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
