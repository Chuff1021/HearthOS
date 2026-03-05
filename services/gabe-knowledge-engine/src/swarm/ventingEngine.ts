import { RetrievedChunk } from "../types";

export type VentRuleRecord = {
  model: string;
  vent_system_pipe_type?: string;
  approved_vent_family?: string;
  min_rise?: string;
  max_vertical?: string;
  max_horizontal?: string;
  elbow_offset_constraints?: string;
  termination_constraints?: string;
  source_page: number | null;
  source_url: string;
  confidence: number;
  quote: string;
};

export function extractVentRuleRecords(chunks: RetrievedChunk[]): VentRuleRecord[] {
  const out: VentRuleRecord[] = [];
  for (const c of chunks) {
    if (c.source_type !== "manual") continue;
    const text = (c.chunk_text || "").replace(/\s+/g, " ");
    const lc = text.toLowerCase();
    if (!/vent|termination|horizontal|vertical|elbow|pipe/.test(lc)) continue;

    const pipe = capture(lc, [/\b(4\s*[x×]\s*6\s*5?\b|5\s*[x×]\s*8\b|3\s*[x×]\s*5\b)/i]);
    const family = capture(text, [/(approved\s+vent(?:ing)?\s+(?:family|system)[:\s]+[^.]{0,80})/i, /(simpson\s+dura-?vent[^.]{0,60})/i, /(selkirk[^.]{0,60})/i, /(security\s+secure\s+vent[^.]{0,60})/i]);
    const minRise = capture(text, [/minimum\s+(?:vertical\s+)?rise(?:\s+of)?\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:ft|feet|in|inches|"))/i]);
    const maxVertical = capture(text, [/maximum\s+vertical(?:\s+run)?(?:\s+of)?\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:ft|feet))/i, /max\.?\s*vertical(?:\s+run)?\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:ft|feet))/i]);
    const maxHorizontal = capture(text, [/maximum\s+horizontal(?:\s+run)?(?:\s+of)?\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:ft|feet))/i, /max\.?\s*horizontal(?:\s+run)?\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:ft|feet))/i]);
    const elbow = capture(text, [/(?:90\s*°|90-degree|90 degree|elbow)[^.]{0,80}(?:equivalent|deduct|reduce|limit)[^.]{0,80}/i]);
    const termination = capture(text, [/(termination[^.]{0,120}(?:window|door|opening|clearance)[^.]{0,120})/i]);

    const fields = [pipe, family, minRise, maxVertical, maxHorizontal, elbow, termination].filter(Boolean).length;
    if (fields === 0) continue;

    const quote = selectQuote(text);
    out.push({
      model: c.model || c.manual_title || "unknown",
      vent_system_pipe_type: norm(pipe),
      approved_vent_family: norm(family),
      min_rise: norm(minRise),
      max_vertical: norm(maxVertical),
      max_horizontal: norm(maxHorizontal),
      elbow_offset_constraints: norm(elbow),
      termination_constraints: norm(termination),
      source_page: c.page_number ?? null,
      source_url: c.source_url,
      confidence: Math.min(95, 55 + fields * 8 + (c.score > 0.8 ? 8 : 0)),
      quote,
    });
  }

  return dedupeRecords(out).sort((a, b) => b.confidence - a.confidence);
}

export function pickBestVentRule(question: string, records: VentRuleRecord[]): VentRuleRecord | null {
  if (records.length === 0) return null;
  const q = question.toLowerCase();
  const byModel = records.map((r) => {
    let bonus = 0;
    const m = (r.model || "").toLowerCase();
    if (m && q.includes(m)) bonus += 15;
    if (q.includes("termination") && r.termination_constraints) bonus += 12;
    if (q.includes("elbow") && r.elbow_offset_constraints) bonus += 12;
    if ((q.includes("vertical") || q.includes("rise")) && (r.min_rise || r.max_vertical)) bonus += 10;
    if (q.includes("horizontal") && r.max_horizontal) bonus += 10;
    if (q.includes("pipe") && r.vent_system_pipe_type) bonus += 10;
    if ((q.includes("family") || q.includes("approved")) && r.approved_vent_family) bonus += 10;
    return { r, score: r.confidence + bonus };
  }).sort((a, b) => b.score - a.score);
  return byModel[0]?.r || null;
}

export function buildVentingAnswerFromRecord(record: VentRuleRecord) {
  const bits = [
    record.vent_system_pipe_type ? `pipe type: ${record.vent_system_pipe_type}` : null,
    record.approved_vent_family ? `approved vent family: ${record.approved_vent_family}` : null,
    record.min_rise ? `min rise: ${record.min_rise}` : null,
    record.max_vertical ? `max vertical: ${record.max_vertical}` : null,
    record.max_horizontal ? `max horizontal: ${record.max_horizontal}` : null,
    record.elbow_offset_constraints ? `elbow/offset constraints: ${record.elbow_offset_constraints}` : null,
    record.termination_constraints ? `termination constraints: ${record.termination_constraints}` : null,
  ].filter(Boolean);

  return {
    answer: `Structured vent-rule record: ${bits.join('; ')}.`,
    source_type: "manual" as const,
    source_url: record.source_url,
    page_number: record.source_page,
    quote: record.quote,
    confidence: record.confidence,
    certainty: (record.confidence >= 85 ? "Verified Exact" : "Verified Partial") as "Verified Exact" | "Verified Partial",
    validator_notes: ["vent_rule_structured"],
  };
}

function dedupeRecords(records: VentRuleRecord[]) {
  const m = new Map<string, VentRuleRecord>();
  for (const r of records) {
    const key = [r.model, r.source_url, r.source_page, r.vent_system_pipe_type, r.min_rise, r.max_vertical, r.max_horizontal].join('|');
    const ex = m.get(key);
    if (!ex || r.confidence > ex.confidence) m.set(key, r);
  }
  return [...m.values()];
}

function capture(text: string, patterns: RegExp[]) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] || m[0] || '').trim();
  }
  return undefined;
}

function norm(v?: string) { return v ? v.replace(/\s+/g, ' ').trim() : undefined; }

function selectQuote(text: string) {
  const s = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  return (s.find((x) => /vent|termination|vertical|horizontal|elbow|pipe/i.test(x)) || s[0] || text).split(/\s+/).slice(0, 32).join(' ');
}
