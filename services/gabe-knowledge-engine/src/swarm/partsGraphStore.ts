import postgres from "postgres";

export type PartsGraphRow = {
  callout_id: string;
  manual_id: string;
  model?: string | null;
  normalized_model?: string | null;
  family?: string | null;
  size?: string | null;
  figure_page_number?: number | null;
  figure_caption?: string | null;
  diagram_type?: string | null;
  callout_label?: string | null;
  part_number?: string | null;
  part_name?: string | null;
  compatibility_scope?: string | null;
  source_confidence: number;
  source_mode: "native_text" | "ocr" | "hybrid";
  ocr_confidence?: number | null;
  source_url?: string | null;
};

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
  return sql;
}

export async function ensurePartsGraphTable() {
  const s = db();
  if (!s) return;
  await s`
    create table if not exists fireplace_exploded_parts_graph (
      callout_id text primary key,
      manual_id text not null,
      model text,
      normalized_model text,
      family text,
      size text,
      figure_page_number int,
      figure_caption text,
      diagram_type text,
      callout_label text,
      part_number text,
      part_name text,
      compatibility_scope text,
      source_confidence double precision not null default 0,
      source_mode text not null default 'native_text',
      ocr_confidence double precision,
      source_url text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;
}

export async function upsertPartsGraph(rows: PartsGraphRow[]) {
  const s = db();
  if (!s || rows.length === 0) return 0;
  await ensurePartsGraphTable();
  for (const r of rows) {
    await s`
      insert into fireplace_exploded_parts_graph (
        callout_id, manual_id, model, normalized_model, family, size, figure_page_number, figure_caption,
        diagram_type, callout_label, part_number, part_name, compatibility_scope, source_confidence,
        source_mode, ocr_confidence, source_url, updated_at
      ) values (
        ${r.callout_id}, ${r.manual_id}, ${r.model || null}, ${r.normalized_model || null}, ${r.family || null}, ${r.size || null}, ${r.figure_page_number || null}, ${r.figure_caption || null},
        ${r.diagram_type || null}, ${r.callout_label || null}, ${r.part_number || null}, ${r.part_name || null}, ${r.compatibility_scope || null}, ${r.source_confidence || 0},
        ${r.source_mode}, ${r.ocr_confidence || null}, ${r.source_url || null}, now()
      ) on conflict (callout_id) do update set
        part_number = excluded.part_number,
        part_name = excluded.part_name,
        source_confidence = excluded.source_confidence,
        source_mode = excluded.source_mode,
        ocr_confidence = excluded.ocr_confidence,
        updated_at = now()`;
  }
  return rows.length;
}

export async function queryPartsGraph(input: {
  manualIds?: string[];
  normalizedModel?: string;
  partNumber?: string;
  partText?: string;
  limit?: number;
}) {
  const s = db();
  if (!s) return [];
  await ensurePartsGraphTable();
  const rows = await s<any[]>`
    select * from fireplace_exploded_parts_graph
    where (${(input.manualIds || []).length} = 0 or manual_id = any(${input.manualIds || []}))
      and (${input.normalizedModel || ''} = '' or normalized_model = ${input.normalizedModel || ''})
      and (${input.partNumber || ''} = '' or part_number ilike ${'%' + (input.partNumber || '') + '%'})
      and (${input.partText || ''} = '' or part_name ilike ${'%' + (input.partText || '') + '%'} or callout_label ilike ${'%' + (input.partText || '') + '%'})
    order by source_confidence desc, updated_at desc
    limit ${Math.max(1, Math.min(input.limit || 20, 100))}`;
  return rows;
}
