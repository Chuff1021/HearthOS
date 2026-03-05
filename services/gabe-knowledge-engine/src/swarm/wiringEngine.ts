import { RetrievedChunk } from "../types";

export type WiringEdge = { from: string; to: string; note?: string };
export type WiringRecord = {
  record_id: string;
  manual_title: string;
  model: string;
  canonical_components: string[];
  synonyms: Record<string, string[]>;
  edges: WiringEdge[];
  source_page: number | null;
  source_url: string;
  confidence: number;
  quote: string;
};

export const WIRING_ONTOLOGY: Record<string, string[]> = {
  "control module": ["control module", "module", "ifc", "integrated fireplace control", "receiver module"],
  "receiver": ["receiver", "remote receiver", "rf receiver"],
  "gas valve": ["gas valve", "valve", "main valve"],
  "wall switch": ["wall switch", "switch", "on/off switch"],
  "transformer": ["transformer", "24v transformer", "power supply"],
};

export function classifyWiringQuestionType(question: string) {
  const q = question.toLowerCase();
  if (q.includes('path') || q.includes('chain') || q.includes('from') || q.includes('to')) return 'connection_path' as const;
  if (q.includes('purpose') || q.includes('controls')) return 'component_purpose' as const;
  if (q.includes('power source') || q.includes('feeds') || q.includes('power')) return 'power_source' as const;
  if ((q.includes('switch') && q.includes('module')) || q.includes('terminal')) return 'switch_module_relationship' as const;
  if ((q.includes('valve') && q.includes('module')) || q.includes('outputs')) return 'valve_module_relationship' as const;
  if (q.includes('transformer')) return 'transformer_relationship' as const;
  return 'connection_path' as const;
}

export function extractWiringRecords(chunks: RetrievedChunk[]): WiringRecord[] {
  const out: WiringRecord[] = [];
  for (const c of chunks) {
    if (c.source_type !== 'manual') continue;
    const text = (c.chunk_text || '').replace(/\s+/g, ' ');
    const lc = text.toLowerCase();
    if (!/wiring|switch|module|ifc|receiver|transformer|valve|terminal/.test(lc)) continue;

    const comps = Object.keys(WIRING_ONTOLOGY).filter((k) => WIRING_ONTOLOGY[k].some((s) => lc.includes(s)));
    const edges: WiringEdge[] = [];
    const has = (x: string) => comps.includes(x);
    if (has('wall switch') && has('control module')) edges.push({ from: 'wall switch', to: 'control module' });
    if (has('transformer') && has('control module')) edges.push({ from: 'transformer', to: 'control module' });
    if (has('receiver') && has('control module')) edges.push({ from: 'receiver', to: 'control module' });
    if (has('control module') && has('gas valve')) edges.push({ from: 'control module', to: 'gas valve' });

    if (comps.length === 0 || edges.length === 0) continue;

    const confidence = Math.min(96, 55 + comps.length * 5 + edges.length * 9 + (c.score > 0.8 ? 8 : 0));
    out.push({
      record_id: `${c.source_url}|${c.page_number}|${c.manual_title}`,
      manual_title: c.manual_title,
      model: c.model || c.manual_title || 'unknown',
      canonical_components: comps,
      synonyms: WIRING_ONTOLOGY,
      edges,
      source_page: c.page_number ?? null,
      source_url: c.source_url,
      confidence,
      quote: selectQuote(text),
    });
  }

  const map = new Map<string, WiringRecord>();
  for (const r of out) {
    const ex = map.get(r.record_id);
    if (!ex || r.confidence > ex.confidence) map.set(r.record_id, r);
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence);
}

export function pickBestWiringRecord(question: string, records: WiringRecord[]): WiringRecord | null {
  if (records.length === 0) return null;
  const q = question.toLowerCase();
  return records
    .map((r) => {
      let bonus = 0;
      if (q.includes('switch') && r.edges.some((e) => e.from === 'wall switch' && e.to === 'control module')) bonus += 14;
      if (q.includes('transformer') && r.edges.some((e) => e.from === 'transformer' && e.to === 'control module')) bonus += 14;
      if (q.includes('valve') && r.edges.some((e) => e.to === 'gas valve')) bonus += 14;
      if (q.includes('receiver') && r.edges.some((e) => e.from === 'receiver')) bonus += 12;
      return { r, s: r.confidence + bonus };
    })
    .sort((a, b) => b.s - a.s)[0]?.r || null;
}

export function buildWiringAnswerFromRecord(record: WiringRecord, question: string) {
  const qtype = classifyWiringQuestionType(question);
  const edgeText = record.edges.map((e) => `${e.from} -> ${e.to}`).join('; ');
  let answer = `Wiring connection path: ${edgeText}.`;
  const missing: string[] = [];

  if (qtype === 'power_source') {
    const edge = record.edges.find((e) => e.from === 'transformer');
    if (!edge) missing.push('transformer->control module edge');
    answer = `Power source relationship: transformer -> control module${edge ? '' : ' not verified from structured wiring record'}.`;
  } else if (qtype === 'switch_module_relationship') {
    const edge = record.edges.find((e) => e.from === 'wall switch' && e.to === 'control module');
    if (!edge) missing.push('wall switch->control module edge');
    answer = `Switch/module relationship: wall switch -> control module${edge ? '' : ' not verified from structured wiring record'}.`;
  } else if (qtype === 'valve_module_relationship') {
    const edge = record.edges.find((e) => e.from === 'control module' && e.to === 'gas valve');
    if (!edge) missing.push('control module->gas valve edge');
    answer = `Valve/module relationship: control module -> gas valve${edge ? '' : ' not verified from structured wiring record'}.`;
  } else if (qtype === 'transformer_relationship') {
    const edge = record.edges.find((e) => e.from === 'transformer');
    if (!edge) missing.push('transformer edge');
    answer = `Transformer relationship: transformer -> control module${edge ? '' : ' not verified from structured wiring record'}.`;
  } else if (qtype === 'component_purpose') {
    answer = `Canonical wiring components: ${record.canonical_components.join(', ')}.`;
  }

  const notes = ['wiring_rule_structured', `wiring_qtype:${qtype}`, `wiring_record_id:${record.record_id}`];
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

function selectQuote(text: string) {
  const s = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  return (s.find((x) => /wiring|switch|module|ifc|receiver|transformer|valve|terminal/i.test(x)) || s[0] || text).split(/\s+/).slice(0, 32).join(' ');
}
