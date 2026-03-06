import { RetrievedChunk } from "../types";

export type PartsRecord = {
  record_id: string;
  manual_title: string;
  model: string;
  family?: string;
  revision?: string;
  canonical_part_numbers: string[];
  aliases_found: string[];
  callout_refs: string[];
  source_page: number | null;
  source_url: string;
  confidence: number;
  quote: string;
};

export const PART_ALIAS_MAP: Record<string, string[]> = {
  thermopile: ["thermopile", "pilot generator", "millivolt generator"],
  thermocouple: ["thermocouple", "pilot sensor"],
  igniter: ["igniter", "electrode", "spark igniter"],
  module: ["control module", "ifc", "receiver module"],
  valve: ["gas valve", "valve assembly", "gas control valve"],
  blower: ["blower", "fan kit", "convection fan"],
  gasket: ["gasket", "seal"],
  pilot: ["pilot assembly", "pilot", "pilot burner"],
};

export function classifyPartsQuestionType(question: string) {
  const q = question.toLowerCase();
  if (/diagram|callout|exploded/.test(q)) return 'diagram_callout' as const;
  if (/revision|rev\b|variant|family|series/.test(q)) return 'revision_disambiguation' as const;
  if (/alias|also called|aka|same as/.test(q)) return 'alias_lookup' as const;
  return 'part_lookup' as const;
}

export function extractPartsRecords(chunks: RetrievedChunk[]): PartsRecord[] {
  const out: PartsRecord[] = [];
  for (const c of chunks) {
    if (c.source_type !== 'manual') continue;
    const text = (c.chunk_text || '').replace(/\s+/g, ' ');
    const lc = text.toLowerCase();
    if (!/part|replacement|diagram|callout|sku|item\s*#|pn\b/.test(lc)) continue;

    const canonical_part_numbers = canonicalizePartNumbers(text);
    const aliases_found = Object.entries(PART_ALIAS_MAP)
      .filter(([, vals]) => vals.some((v) => lc.includes(v)))
      .map(([k]) => k);
    const callout_refs = Array.from(new Set((text.match(/\b(?:item|callout|ref)\s*#?\s*[a-z0-9-]{1,8}\b/gi) || []).map((s) => s.trim())));

    const family = capture(text, [/(?:family|series)\s*[:\-]?\s*([a-z0-9\- ]{2,24})/i]);
    const revision = capture(text, [/(?:revision|rev\.?|variant)\s*[:\-]?\s*([a-z0-9\-\.]{1,16})/i]);

    const signal = canonical_part_numbers.length + aliases_found.length + callout_refs.length;
    if (signal === 0) continue;

    out.push({
      record_id: `${c.source_url}|${c.page_number}|${c.manual_title}`,
      manual_title: c.manual_title,
      model: c.model || c.manual_title || 'unknown',
      family: family?.trim(),
      revision: revision?.trim(),
      canonical_part_numbers,
      aliases_found,
      callout_refs,
      source_page: c.page_number ?? null,
      source_url: c.source_url,
      confidence: Math.min(96, 56 + signal * 6 + (c.score > 0.8 ? 8 : 0)),
      quote: selectQuote(text),
    });
  }

  const m = new Map<string, PartsRecord>();
  for (const r of out) {
    const ex = m.get(r.record_id);
    if (!ex || r.confidence > ex.confidence) m.set(r.record_id, r);
  }
  return [...m.values()].sort((a, b) => b.confidence - a.confidence);
}

export function pickBestPartsRecord(question: string, records: PartsRecord[]): PartsRecord | null {
  if (!records.length) return null;
  const q = question.toLowerCase();
  const qtype = classifyPartsQuestionType(question);

  const filtered = records.filter((r) => {
    if (qtype === 'diagram_callout') return r.callout_refs.length > 0 || /diagram|exploded/i.test(r.quote);
    if (qtype === 'revision_disambiguation') return Boolean(r.family || r.revision);
    if (qtype === 'alias_lookup') return r.aliases_found.length > 0;
    return r.canonical_part_numbers.length > 0 || r.aliases_found.length > 0;
  });

  const pool = filtered.length ? filtered : records;
  return pool
    .map((r) => {
      let bonus = 0;
      if (q.includes('thermopile') && r.aliases_found.includes('thermopile')) bonus += 12;
      if (q.includes('thermocouple') && r.aliases_found.includes('thermocouple')) bonus += 12;
      if (q.includes('diagram') && r.callout_refs.length) bonus += 10;
      if ((q.includes('revision') || q.includes('family')) && (r.family || r.revision)) bonus += 10;
      if (r.canonical_part_numbers.length) bonus += 8;
      return { r, s: r.confidence + bonus };
    })
    .sort((a, b) => b.s - a.s)[0]?.r || null;
}

export function buildPartsAnswerFromRecord(record: PartsRecord, question: string, allRecords: PartsRecord[] = []) {
  const qtype = classifyPartsQuestionType(question);
  const merged = mergeRecords([record, ...allRecords]);
  const missing: string[] = [];

  let answer = '';
  if (qtype === 'part_lookup') {
    if (!merged.canonical_part_numbers.length) missing.push('canonical_part_numbers');
    answer = `Normalized part numbers: ${merged.canonical_part_numbers.slice(0, 5).join(', ') || 'not verified from structured parts records'}.`;
  } else if (qtype === 'diagram_callout') {
    if (!merged.callout_refs.length) missing.push('callout_refs');
    answer = `Diagram callouts: ${merged.callout_refs.slice(0, 6).join(', ') || 'not verified from structured parts records'}.`;
  } else if (qtype === 'revision_disambiguation') {
    if (!merged.family && !merged.revision) missing.push('family/revision');
    answer = `Family/revision disambiguation: family=${merged.family || 'not verified'}, revision=${merged.revision || 'not verified'}.`;
  } else if (qtype === 'alias_lookup') {
    if (!merged.aliases_found.length) missing.push('aliases_found');
    answer = `Alias mapping found: ${merged.aliases_found.join(', ') || 'not verified from structured parts records'}.`;
  }

  const notes = ['parts_rule_structured', `parts_qtype:${qtype}`, `parts_record_id:${record.record_id}`];
  if (missing.length) notes.push(`missing_fields:${missing.join(',')}`);

  return {
    answer: `${answer} Source: page ${record.source_page ?? 'unknown'}. Model: ${record.model}.`,
    source_type: 'manual' as const,
    manual_title: record.manual_title,
    page_number: record.source_page ?? 1,
    source_url: record.source_url,
    quote: record.quote,
    confidence: missing.length ? Math.min(record.confidence, 74) : record.confidence,
    certainty: (missing.length ? 'Verified Partial' : (record.confidence >= 85 ? 'Verified Exact' : 'Verified Partial')) as 'Verified Exact' | 'Verified Partial',
    validator_notes: notes,
  };
}

export function canonicalizePartNumbers(text: string) {
  const matches = (text.match(/\b(?:[A-Z]{0,3}-)?\d{3,7}[A-Z0-9-]{0,8}\b/g) || []);
  return Array.from(new Set(matches.map((m) => m.toUpperCase().replace(/\s+/g, '')))).slice(0, 40);
}

function mergeRecords(records: PartsRecord[]) {
  const partNums = Array.from(new Set(records.flatMap((r) => r.canonical_part_numbers)));
  const aliases = Array.from(new Set(records.flatMap((r) => r.aliases_found)));
  const callouts = Array.from(new Set(records.flatMap((r) => r.callout_refs)));
  return {
    canonical_part_numbers: partNums,
    aliases_found: aliases,
    callout_refs: callouts,
    family: records.find((r) => r.family)?.family,
    revision: records.find((r) => r.revision)?.revision,
  };
}

function capture(text: string, patterns: RegExp[]) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] || m[0] || '').trim();
  }
  return undefined;
}

function selectQuote(text: string) {
  const s = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  return (s.find((x) => /part|replacement|diagram|callout|sku|item|thermopile|thermocouple/i.test(x)) || s[0] || text).split(/\s+/).slice(0, 32).join(' ');
}
