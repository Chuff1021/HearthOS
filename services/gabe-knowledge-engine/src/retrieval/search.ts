import { qdrant } from "./qdrant";
import { env } from "../config";
import { RetrievedChunk } from "../types";

function mapHit(r: any, score: number): RetrievedChunk {
  const payload = r.payload as any;
  return {
    manual_title: payload.manual_title || payload.diagram_type || "diagram",
    manufacturer: payload.manufacturer || payload.brand || "",
    model: payload.model,
    page_number: payload.page_number || payload.page || 0,
    source_url: payload.source_url || payload.manual_url || "",
    chunk_text: payload.chunk_text || payload.text || JSON.stringify(payload.structured_data || {}),
    section_title: payload.section_title || payload.section || payload.diagram_type,
    doc_type: payload.doc_type || payload.diagram_type || "other",
    score,
    source_type: payload.source_type ?? "manual",
    section: payload.section
  } satisfies RetrievedChunk;
}

export async function searchManualChunks(vector: number[], limit = 5): Promise<RetrievedChunk[]> {
  const res = await qdrant.search(env.QDRANT_COLLECTION, {
    vector,
    limit,
    with_payload: true
  });
  return res.map((r: any) => mapHit(r, r.score));
}

export async function keywordSearchManualChunks(terms: string[], limit = 50): Promise<RetrievedChunk[]> {
  if (terms.length === 0) return [];
  const res = await qdrant.scroll(env.QDRANT_COLLECTION, {
    limit,
    with_payload: true,
    with_vector: false,
    filter: { should: terms.map((term) => ({ key: "chunk_text", match: { text: term } })) }
  });
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
