import { qdrant } from "../retrieval/qdrant";
import { env } from "../config";
import postgres from "postgres";

export type CorpusCompleteness = {
  total_registry_manuals: number;
  manuals_with_complete_chunk_coverage: number;
  manuals_with_quarantined_chunks: number;
  manuals_missing_section_metadata: number;
  manuals_missing_page_linkage: number;
  manuals_low_confidence_metadata: number;
  strict_manual_id_coverage_rate: number;
  incomplete_manual_ids: string[];
};

export async function computeCorpusCompleteness(): Promise<CorpusCompleteness> {
  const pointsRes = await qdrant.scroll(env.QDRANT_COLLECTION, {
    limit: 100000,
    with_payload: true,
    with_vector: false,
  } as any);
  const points = (pointsRes as any).points || [];

  const byManual = new Map<string, any[]>();
  let withManualId = 0;
  for (const p of points) {
    const x = p.payload || {};
    const mid = String(x.manual_id || "");
    if (mid) withManualId += 1;
    const arr = byManual.get(mid || "__missing__") || [];
    arr.push(x);
    byManual.set(mid || "__missing__", arr);
  }

  let totalRegistry = 0;
  let lowConfidence = 0;
  let quarantined = 0;
  if (process.env.DATABASE_URL) {
    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
    const rows = await sql<{ c: number }[]>`select count(*)::int as c from fireplace_manual_registry where status='active'`;
    totalRegistry = rows[0]?.c || 0;
    const low = await sql<{ c: number }[]>`select count(*)::int as c from fireplace_manual_registry where metadata_confidence < 0.6`;
    lowConfidence = low[0]?.c || 0;
    const q = await sql<{ c: number }[]>`select count(*)::int as c from fireplace_manual_registry where status='quarantined'`;
    quarantined = q[0]?.c || 0;
    await sql.end({ timeout: 1 });
  }

  let missingSection = 0;
  let missingPage = 0;
  let complete = 0;
  const incompleteManualIds: string[] = [];

  for (const [mid, arr] of byManual.entries()) {
    if (!mid || mid === "__missing__") continue;
    const hasMissingSection = arr.some((x) => !x.section_type || !x.content_kind);
    const hasMissingPage = arr.some((x) => !x.page_number || Number(x.page_number) <= 0);
    const hasMissingType = arr.some((x) => !x.manual_type);

    if (hasMissingSection) missingSection += 1;
    if (hasMissingPage) missingPage += 1;

    if (!hasMissingSection && !hasMissingPage && !hasMissingType) complete += 1;
    else incompleteManualIds.push(mid);
  }

  const strictCoverage = points.length ? Number((withManualId / points.length).toFixed(4)) : 0;

  return {
    total_registry_manuals: totalRegistry,
    manuals_with_complete_chunk_coverage: complete,
    manuals_with_quarantined_chunks: quarantined,
    manuals_missing_section_metadata: missingSection,
    manuals_missing_page_linkage: missingPage,
    manuals_low_confidence_metadata: lowConfidence,
    strict_manual_id_coverage_rate: strictCoverage,
    incomplete_manual_ids: incompleteManualIds,
  };
}
