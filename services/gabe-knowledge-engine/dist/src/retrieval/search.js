"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchManualChunks = searchManualChunks;
exports.keywordSearchManualChunks = keywordSearchManualChunks;
exports.searchDiagramChunks = searchDiagramChunks;
exports.searchQaMemoryChunks = searchQaMemoryChunks;
exports.keywordSearchDiagramChunks = keywordSearchDiagramChunks;
const qdrant_1 = require("./qdrant");
const config_1 = require("../config");
function mapHit(r, score) {
    const payload = r.payload;
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
    };
}
async function searchManualChunks(vector, limit = 5) {
    const res = await qdrant_1.qdrant.search(config_1.env.QDRANT_COLLECTION, {
        vector,
        limit,
        with_payload: true
    });
    return res.map((r) => mapHit(r, r.score));
}
async function keywordSearchManualChunks(terms, limit = 50) {
    if (terms.length === 0)
        return [];
    const res = await qdrant_1.qdrant.scroll(config_1.env.QDRANT_COLLECTION, {
        limit,
        with_payload: true,
        with_vector: false,
        filter: { should: terms.map((term) => ({ key: "chunk_text", match: { text: term } })) }
    });
    return (res.points ?? []).map((r) => mapHit(r, 1));
}
async function searchDiagramChunks(vector, limit = 5) {
    const res = await qdrant_1.qdrant.search(config_1.env.QDRANT_DIAGRAM_COLLECTION, {
        vector,
        limit,
        with_payload: true,
    });
    return res.map((r) => mapHit(r, r.score));
}
async function searchQaMemoryChunks(vector, limit = 5) {
    const res = await qdrant_1.qdrant.search('fireplace_qa_memory', {
        vector,
        limit,
        with_payload: true,
    });
    return res.map((r) => {
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
        };
    });
}
async function keywordSearchDiagramChunks(terms, limit = 30) {
    if (terms.length === 0)
        return [];
    const res = await qdrant_1.qdrant.scroll(config_1.env.QDRANT_DIAGRAM_COLLECTION, {
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
    return (res.points ?? []).map((r) => mapHit(r, 1));
}
