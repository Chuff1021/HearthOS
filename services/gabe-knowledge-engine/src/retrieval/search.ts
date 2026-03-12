import { qdrant } from "./qdrant";
import { env } from "../config";
import { RetrievedChunk } from "../types";
import type { RegistryManual } from "../swarm/manualRegistry";

export type ChunkScope = {
  allowedManualIds?: string[];
  allowedManualTypes?: string[];
  preferredSectionTypes?: string[];
};

function mapHit(r: any, score: number): RetrievedChunk {
  const payload = r.payload as any;
  return {
    manual_id: payload.manual_id,
    manual_title: payload.manual_title || payload.diagram_type || "diagram",
    manufacturer: payload.manufacturer || payload.brand || "",
    brand: payload.brand || payload.manufacturer || "",
    model: payload.model,
    normalized_model: payload.normalized_model,
    family: payload.family,
    size: payload.size,
    page_number: payload.page_number || payload.page || 0,
    source_url: payload.source_url || payload.manual_url || "",
    chunk_text: payload.chunk_text || payload.text || JSON.stringify(payload.structured_data || {}),
    section_type: payload.section_type,
    content_kind: payload.content_kind,
    section_title: payload.section_title || payload.section || payload.diagram_type,
    revision: payload.revision,
    language: payload.language,
    figure_present: payload.figure_present,
    figure_caption: payload.figure_caption,
    heading_scope: payload.heading_scope,
    page_image_ref: payload.page_image_ref,
    diagram_type: payload.diagram_type,
    figure_note_text: payload.figure_note_text,
    callout_labels: payload.callout_labels,
    ocr_used: payload.ocr_used,
    ocr_confidence: payload.ocr_confidence,
    ocr_source_mode: payload.ocr_source_mode,
    doc_type: payload.doc_type || payload.manual_type || payload.diagram_type || "other",
    score,
    source_type: payload.source_type ?? "manual",
    section: payload.section
  } satisfies RetrievedChunk;
}

function buildScopeFilter(scope?: ChunkScope, allowedManuals?: RegistryManual[]) {
  const must: any[] = [];

  const ids = scope?.allowedManualIds || [];
  if (ids.length > 0) {
    must.push({ should: ids.map((id) => ({ key: "manual_id", match: { value: id } })) });
  } else if (allowedManuals && allowedManuals.length > 0) {
    must.push({ should: allowedManuals.map((m) => ({ key: "manual_id", match: { value: m.manual_id } })) });
  }

  if (scope?.allowedManualTypes?.length) {
    must.push({ should: scope.allowedManualTypes.map((t) => ({ key: "manual_type", match: { text: t } })) });
  }

  if (scope?.preferredSectionTypes?.length) {
    must.push({ should: scope.preferredSectionTypes.map((t) => ({ key: "section_type", match: { text: t } })) });
  }

  return must.length ? { must } : undefined;
}

export async function searchManualChunks(vector: number[], limit = 5, allowedManuals?: RegistryManual[], scope?: ChunkScope): Promise<RetrievedChunk[]> {
  const res = await qdrant.search(env.QDRANT_COLLECTION, {
    vector,
    limit,
    with_payload: true,
    filter: buildScopeFilter(scope, allowedManuals) as any,
  } as any);
  return res.map((r: any) => mapHit(r, r.score));
}

export async function keywordSearchManualChunks(terms: string[], limit = 50, allowedManuals?: RegistryManual[], scope?: ChunkScope): Promise<RetrievedChunk[]> {
  if (terms.length === 0) return [];
  const textClause: any = { should: terms.map((term) => ({ key: "chunk_text", match: { text: term } })) };
  const sf = buildScopeFilter(scope, allowedManuals) as any;
  const filter = sf ? { must: [textClause, ...(sf.must || [])] } : textClause;
  const res = await qdrant.scroll(env.QDRANT_COLLECTION, {
    limit,
    with_payload: true,
    with_vector: false,
    filter,
  } as any);
  return (res.points ?? []).map((r: any) => mapHit(r, 1));
}

export async function searchDiagramChunks(vector: number[], limit = 5): Promise<RetrievedChunk[]> {
  const res = await qdrant.search(env.QDRANT_DIAGRAM_COLLECTION, {
    vector,
    limit,
    with_payload: true,
  });
  return res.map((r: any) => mapHit(r, r.score));
}

export async function searchQaMemoryChunks(vector: number[], limit = 5): Promise<RetrievedChunk[]> {
  const res = await qdrant.search('fireplace_qa_memory', {
    vector,
    limit,
    with_payload: true,
  } as any);
  return res.map((r: any) => {
    const p = r.payload || {};
    return {
      manual_title: 'Technician QA Memory',
      manufacturer: p.brand || '',
      model: p.model,
      page_number: 0,
      source_url: (Array.isArray(p.source_urls) ? p.source_urls[0] : p.source_urls) || '',
      chunk_text: `${p.question || ''}\n${p.answer || ''}`,
      section_title: 'qa_memory',
      doc_type: 'other',
      score: r.score,
      source_type: p.verified ? 'manual' : 'web',
      section: 'qa_memory',
    } as RetrievedChunk;
  });
}

export async function keywordSearchDiagramChunks(terms: string[], limit = 30): Promise<RetrievedChunk[]> {
  if (terms.length === 0) return [];
  const res = await qdrant.scroll(env.QDRANT_DIAGRAM_COLLECTION, {
    limit,
    with_payload: true,
    with_vector: false,
    filter: {
      should: [
        ...terms.map((term) => ({ key: "text", match: { text: term } })),
        ...terms.map((term) => ({ key: "structured_data", match: { text: term } })),
      ]
    }
  });
  return (res.points ?? []).map((r: any) => mapHit(r, 1));
}
