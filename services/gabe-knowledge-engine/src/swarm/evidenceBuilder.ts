import { RetrievedChunk } from "../types";
import { ModelDetection } from "./modelDetector";
import { IntentCategory } from "./intentClassifier";

export type EvidencePacket = {
  detectedModel: {
    brand?: string;
    model?: string;
    family?: string;
    variant?: string;
    confidence: number;
    needs_clarification: boolean;
  };
  intent: {
    intent: IntentCategory;
    subtopic?: string;
    secondary_intents: string[];
    confidence: number;
  };
  manualEvidence: RetrievedChunk[];
  diagramEvidence: RetrievedChunk[];
  ocrLabels: string[];
  qaMemoryMatches: Array<{ question: string; answer: string; verified: boolean }>;
  tavilyFallbackEvidence: Array<{ title: string; url: string; snippet: string }>;
  provenance: Array<{ sourceType: string; sourceUrl?: string; page?: number; score: number }>;
  sourceRanking: Array<{ sourceId: string; score: number; rank: number }>;
  confidenceBySource: Array<{ sourceId: string; confidence: number }>;
  validatorNotes: string[];
};

export function buildEvidencePacket(input: {
  modelDetection: ModelDetection;
  intent: { intent: IntentCategory; subtopic?: string };
  retrieved: RetrievedChunk[];
  qaMemory?: RetrievedChunk[];
  webHints: Array<{ title: string; url: string; snippet: string }>;
}): EvidencePacket {
  const manualEvidence = input.retrieved.filter((r) => r.source_type === "manual" && !(r.section_title || "").toLowerCase().includes("diagram"));
  const diagramEvidence = input.retrieved.filter((r) => (r.section_title || "").toLowerCase().includes("diagram") || (r.doc_type || "") === "other" && (r.chunk_text || "").toLowerCase().includes("diagram"));

  const ocrLabels = Array.from(new Set(
    diagramEvidence
      .flatMap((d) => (d.chunk_text || "").match(/\b\d+(?:\s*1\/2|\s*1\/4|\s*3\/4)?\s*(?:in|"|mm|ft)\b/gi) || [])
      .slice(0, 30)
  ));

  const provenance = input.retrieved.slice(0, 20).map((r) => ({
    sourceType: r.source_type,
    sourceUrl: r.source_url,
    page: r.page_number,
    score: r.score,
  }));

  const sourceRanking = input.retrieved.slice(0, 20).map((r, idx) => ({
    sourceId: `${r.manual_title || r.source_url}#${r.page_number}`,
    score: r.score,
    rank: idx + 1,
  }));

  const confidenceBySource = sourceRanking.map((s) => ({ sourceId: s.sourceId, confidence: Math.max(0, Math.min(100, Math.round(s.score * 100))) }));

  return {
    detectedModel: {
      brand: input.modelDetection.brand,
      model: input.modelDetection.model,
      family: undefined,
      variant: input.modelDetection.type,
      confidence: input.modelDetection.confidence,
      needs_clarification: !!input.modelDetection.clarificationQuestion,
    },
    intent: {
      intent: input.intent.intent,
      subtopic: input.intent.subtopic,
      secondary_intents: [],
      confidence: 0.8,
    },
    manualEvidence,
    diagramEvidence,
    ocrLabels,
    qaMemoryMatches: (input.qaMemory || []).slice(0, 8).map((q) => ({
      question: (q.chunk_text || '').split('\n')[0] || '',
      answer: (q.chunk_text || '').split('\n').slice(1).join('\n') || '',
      verified: q.source_type === 'manual',
    })),
    tavilyFallbackEvidence: input.webHints,
    provenance,
    sourceRanking,
    confidenceBySource,
    validatorNotes: [],
  };
}
