import { qdrant } from "./qdrant";
import { env } from "../config";
import { RetrievedChunk } from "../types";

export async function searchManualChunks(vector: number[], limit = 5): Promise<RetrievedChunk[]> {
  const res = await qdrant.search(env.QDRANT_COLLECTION, {
    vector,
    limit,
    with_payload: true
  });

  return res.map((r: any) => {
    const payload = r.payload as any;
    return {
      manual_title: payload.manual_title,
      manufacturer: payload.manufacturer,
      model: payload.model,
      page_number: payload.page_number,
      source_url: payload.source_url,
      chunk_text: payload.chunk_text,
      section_title: payload.section_title,
      doc_type: payload.doc_type,
      score: r.score,
      source_type: payload.source_type ?? "manual",
      section: payload.section
    } satisfies RetrievedChunk;
  });
}

export async function keywordSearchManualChunks(terms: string[], limit = 50): Promise<RetrievedChunk[]> {
  if (terms.length === 0) return [];
  const res = await qdrant.scroll(env.QDRANT_COLLECTION, {
    limit,
    with_payload: true,
    with_vector: false,
    filter: {
      should: terms.map((term) => ({
        key: "chunk_text",
        match: { text: term }
      }))
    }
  });

  const points = res.points ?? [];
  return points.map((r: any) => {
    const payload = r.payload as any;
    return {
      manual_title: payload.manual_title,
      manufacturer: payload.manufacturer,
      model: payload.model,
      page_number: payload.page_number,
      source_url: payload.source_url,
      chunk_text: payload.chunk_text,
      section_title: payload.section_title,
      doc_type: payload.doc_type,
      score: 1,
      source_type: payload.source_type ?? "manual",
      section: payload.section
    } satisfies RetrievedChunk;
  });
}
