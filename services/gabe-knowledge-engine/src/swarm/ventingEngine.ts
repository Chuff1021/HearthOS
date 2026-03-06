import { RetrievedChunk } from "../types";

export type VentRuleRecord = {
  record_id: string;
  manual_title: string;
  model: string;
  vent_system_pipe_type?: string;
  approved_vent_family?: string;
  min_rise?: string;
  max_vertical?: string;
  max_horizontal?: string;
  elbow_offset_constraints?: string;
  equivalent_run_penalty?: string;
  elbow_notes?: string;
  window_door_clearance_notes?: string;
  required_conditions?: string;
  termination_exceptions?: string;
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
    const elbow = capture(text, [/(?:90\s*°|90-degree|90 degree|elbow)[^.]{0,120}/i]);
    const equivalentPenalty = capture(text, [/(?:90\s*°|90-degree|elbow)[^.]{0,120}(?:equivalent|deduct|reduce|subtract|counts as)[^.]{0,120}/i]);
    const requiredConditions = capture(text, [/(?:must|required|requires)[^.]{0,120}(?:before|prior to|for vent|for horizontal run)[^.]{0,120}/i]);
    const windowDoor = capture(text, [/(?:window|door|opening)[^.]{0,120}(?:clearance|minimum|termination)[^.]{0,120}/i]);
    const termExc = capture(text, [/(?:except|unless)[^.]{0,120}(?:termination|vent)[^.]{0,120}/i]);
    const termination = capture(text, [/(termination[^.]{0,160}(?:window|door|opening|clearance)[^.]{0,120})/i]);

    const ventTableHint = capture(text, [/(vent\s*(table|chart|graph)[^.]{0,120})/i, /(model-specific\s+vent[^.]{0,120})/i]);
    const fields = [pipe, family, minRise, maxVertical, maxHorizontal, elbow, equivalentPenalty, requiredConditions, windowDoor, termExc, termination, ventTableHint].filter(Boolean).length;
    if (fields === 0) continue;

    const quote = selectQuote(text);
    out.push({
      record_id: `${c.source_url}|${c.page_number}|${c.manual_title}`,
      manual_title: c.manual_title,
      model: c.model || c.manual_title || "unknown",
      vent_system_pipe_type: norm(pipe),
      approved_vent_family: norm(family),
      min_rise: norm(minRise),
      max_vertical: norm(maxVertical),
      max_horizontal: norm(maxHorizontal),
      elbow_offset_constraints: norm(elbow),
      equivalent_run_penalty: norm(equivalentPenalty),
      elbow_notes: norm(elbow),
      window_door_clearance_notes: norm(windowDoor),
      required_conditions: norm(requiredConditions || ventTableHint),
      termination_exceptions: norm(termExc),
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

  const qNums = new Set((question.match(/\b\d{2,3}\b/g) || []).map((n) => String(n)));
  const hasAny = (...arr: string[]) => arr.some((a) => q.includes(a));

  const byModel = records
    .map((r) => {
      let bonus = 0;
      const m = (r.model || "").toLowerCase();
      if (m && q.includes(m)) bonus += 18;
      if (qNums.size > 0 && [...qNums].some((n) => m.includes(n))) bonus += 14;

      if (hasAny("vent table", "vent chart") && (r.required_conditions || "").toLowerCase().includes("vent")) bonus += 10;

      if (hasAny("termination", "window", "door", "opening") && (r.termination_constraints || r.window_door_clearance_notes)) bonus += 12;
      if (hasAny("elbow", "offset", "90-degree", "90 degree") && (r.elbow_offset_constraints || r.equivalent_run_penalty)) bonus += 12;
      if (hasAny("vertical", "rise", "limit") && (r.min_rise || r.max_vertical)) bonus += 10;
      if (hasAny("horizontal", "hori") && r.max_horizontal) bonus += 10;
      if (hasAny("pipe", "direct vent", "dv") && r.vent_system_pipe_type) bonus += 10;
      if (hasAny("family", "approved") && r.approved_vent_family) bonus += 10;

      return { r, score: r.confidence + bonus };
    })
    .sort((a, b) => b.score - a.score);

  return byModel[0]?.r || null;
}

export function classifyVentingQuestionType(question: string) {
  const q = question.toLowerCase();
  const has = (x: string) => q.includes(x);
  const hasAny = (...arr: string[]) => arr.some((a) => q.includes(a));

  if (hasAny('minimum', 'min') && has('rise')) return 'min_rise_before_horizontal' as const;
  if (hasAny('maximum', 'max') && hasAny('horizontal', 'hori')) return 'max_horizontal_run' as const;
  if (hasAny('maximum', 'max', 'limit') && hasAny('vertical', 'vert')) return 'max_vertical_run' as const;
  if (hasAny('elbow', 'offset', '90-degree', '90 degree')) return 'elbow_offset_effect' as const;
  if (hasAny('termination', 'window', 'door', 'opening')) return 'termination_restriction' as const;
  if (hasAny('pipe', 'vent family', 'approved', 'dv', 'direct vent')) return 'pipe_or_family' as const;
  if (hasAny('vent table', 'vent chart', 'venting applies')) return 'general_venting' as const;
  return 'general_venting' as const;
}

export function buildVentingAnswerFromRecord(record: VentRuleRecord, question: string) {
  const type = classifyVentingQuestionType(question);
  const missing: string[] = [];
  let answer = '';

  if (type === 'min_rise_before_horizontal') {
    if (!record.min_rise) missing.push('min_rise');
    answer = `Minimum rise rule: minimum vertical rise before horizontal run = ${record.min_rise || 'not verified from structured vent-rule records'}.`;
    answer += ` Horizontal precondition: ${record.required_conditions || 'not verified from structured vent-rule records'}.`;
  } else if (type === 'max_horizontal_run') {
    if (!record.max_horizontal) missing.push('max_horizontal');
    answer = `Maximum horizontal rule: max horizontal run = ${record.max_horizontal || 'not verified from structured vent-rule records'}.`;
    answer += ` Vent table/chart condition: ${record.required_conditions || 'not verified from structured vent-rule records'}.`;
  } else if (type === 'max_vertical_run') {
    if (!record.max_vertical) missing.push('max_vertical');
    answer = `Maximum vertical rule: max vertical run = ${record.max_vertical || 'not verified from structured vent-rule records'}.`;
    answer += ` Vent table/chart condition: ${record.required_conditions || 'not verified from structured vent-rule records'}.`;
  } else if (type === 'elbow_offset_effect') {
    if (!record.elbow_offset_constraints && !record.equivalent_run_penalty) missing.push('elbow/equivalent_run_penalty');
    answer = `Elbow effect rule: elbow/offset constraint = ${record.elbow_offset_constraints || 'not verified from structured vent-rule records'}.`;
    answer += ` Equivalent run penalty = ${record.equivalent_run_penalty || 'not verified from structured vent-rule records'}.`;
  } else if (type === 'termination_restriction') {
    if (!record.termination_constraints && !record.window_door_clearance_notes) missing.push('termination/window_door_clearance_notes');
    answer = `Termination restriction rule: window/door opening clearance = ${record.window_door_clearance_notes || 'not verified from structured vent-rule records'}.`;
    answer += ` Termination constraint = ${record.termination_constraints || 'not verified from structured vent-rule records'}.`;
    if (record.termination_exceptions) answer += ` Exceptions: ${record.termination_exceptions}.`;
  } else if (type === 'pipe_or_family') {
    if (!record.vent_system_pipe_type && !record.approved_vent_family) missing.push('vent_system_pipe_type/approved_vent_family');
    answer = `Venting family rule: approved pipe type = ${record.vent_system_pipe_type || 'not verified from structured vent-rule records'}.`;
    answer += ` Approved vent family = ${record.approved_vent_family || 'not verified from structured vent-rule records'}.`;
  } else {
    answer = `General venting rule: min rise ${record.min_rise || 'not verified'}, max horizontal ${record.max_horizontal || 'not verified'}, max vertical ${record.max_vertical || 'not verified'}, vent table/chart condition ${record.required_conditions || 'not verified'}, termination ${record.termination_constraints || record.window_door_clearance_notes || 'not verified'}.`;
  }

  const notes = ['vent_rule_structured', `vent_qtype:${type}`, `vent_record_id:${record.record_id}`];
  let certainty: 'Verified Exact' | 'Verified Partial' = record.confidence >= 85 ? 'Verified Exact' : 'Verified Partial';
  if (missing.length) {
    notes.push(`missing_fields:${missing.join(',')}`);
    certainty = 'Verified Partial';
  }

  return {
    answer: `${answer} Source: page ${record.source_page ?? 'unknown'}. Model: ${record.model}.`,
    source_type: 'manual' as const,
    manual_title: record.manual_title,
    source_url: record.source_url,
    page_number: record.source_page ?? 1,
    quote: record.quote,
    confidence: missing.length ? Math.min(record.confidence, 74) : record.confidence,
    certainty,
    validator_notes: notes,
  };
}

function dedupeRecords(records: VentRuleRecord[]) {
  const m = new Map<string, VentRuleRecord>();
  for (const r of records) {
    const key = [r.record_id, r.model, r.source_url, r.source_page, r.vent_system_pipe_type, r.min_rise, r.max_vertical, r.max_horizontal].join('|');
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
