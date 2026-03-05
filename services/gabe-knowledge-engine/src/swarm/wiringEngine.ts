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
  if (q.includes('canonical wiring components') || (q.includes('canonical') && q.includes('component'))) return 'canonical_components' as const;
  if ((q.includes('full') || q.includes('summarize')) && q.includes('path')) return 'full_path_summary' as const;
  if (q.includes('receiver') || q.includes('ifc')) return 'receiver_ifc_relationship' as const;
  if (q.includes('transformer')) return 'transformer_relationship' as const;
  if ((q.includes('switch') && q.includes('module')) || q.includes('terminal')) return 'switch_module_relationship' as const;
  if ((q.includes('valve') && q.includes('module')) || q.includes('outputs')) return 'valve_module_relationship' as const;
  if (q.includes('purpose') || q.includes('controls')) return 'component_purpose' as const;
  if (q.includes('power source') || q.includes('feeds') || q.includes('power')) return 'power_source' as const;
  if (q.includes('path') || q.includes('chain') || q.includes('from') || q.includes('to')) return 'connection_path' as const;
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
  const qtype = classifyWiringQuestionType(question);
  const q = question.toLowerCase();
  const filtered = records.filter((r) => {
    const hasEdge = (f: string, t: string) => r.edges.some((e) => e.from === f && e.to === t);
    if (qtype === 'transformer_relationship' || qtype === 'power_source') return hasEdge('transformer', 'control module');
    if (qtype === 'receiver_ifc_relationship') return hasEdge('receiver', 'control module') || r.canonical_components.includes('control module');
    if (qtype === 'switch_module_relationship') return hasEdge('wall switch', 'control module');
    if (qtype === 'valve_module_relationship') return hasEdge('control module', 'gas valve');
    if (qtype === 'component_purpose') return r.canonical_components.includes('control module') && r.canonical_components.includes('gas valve');
    if (qtype === 'canonical_components') return r.canonical_components.length >= 3;
    if (qtype === 'full_path_summary') return hasEdge('control module', 'gas valve') && (hasEdge('transformer', 'control module') || hasEdge('wall switch', 'control module'));
    if (q.includes('valve')) return hasEdge('control module', 'gas valve');
    return true;
  });

  const pool = filtered.length ? filtered : records;
  return pool
    .map((r) => {
      let bonus = 0;
      if (r.edges.some((e) => e.from === 'wall switch' && e.to === 'control module')) bonus += 5;
      if (r.edges.some((e) => e.from === 'transformer' && e.to === 'control module')) bonus += 8;
      if (r.edges.some((e) => e.from === 'receiver' && e.to === 'control module')) bonus += 8;
      if (r.edges.some((e) => e.from === 'control module' && e.to === 'gas valve')) bonus += 10;
      return { r, s: r.confidence + bonus };
    })
    .sort((a, b) => b.s - a.s)[0]?.r || null;
}

export function buildWiringAnswerFromRecord(record: WiringRecord, question: string, allRecords: WiringRecord[] = []) {
  const qtype = classifyWiringQuestionType(question);
  const missing: string[] = [];
  const aggregateEdges = mergeEdges([record, ...allRecords]);
  const hasEdge = (f: string, t: string) => aggregateEdges.some((e) => e.from === f && e.to === t);

  let answer = `Wiring connection path: ${formatEdges(aggregateEdges)}.`;

  if (qtype === 'power_source' || qtype === 'transformer_relationship') {
    if (!hasEdge('transformer', 'control module')) missing.push('transformer->control module edge');
    answer = `Transformer relationship: transformer -> control module${hasEdge('transformer', 'control module') ? '' : ' not verified from structured wiring record'}.`;
  } else if (qtype === 'receiver_ifc_relationship') {
    if (!hasEdge('receiver', 'control module')) missing.push('receiver/IFC->control module edge');
    answer = `Receiver/IFC relationship: receiver (IFC) -> control module${hasEdge('receiver', 'control module') ? '' : ' not verified from structured wiring record'}.`;
  } else if (qtype === 'switch_module_relationship') {
    if (!hasEdge('wall switch', 'control module')) missing.push('wall switch->control module edge');
    answer = `Switch/module relationship: wall switch -> control module${hasEdge('wall switch', 'control module') ? '' : ' not verified from structured wiring record'}.`;
  } else if (qtype === 'valve_module_relationship') {
    if (!hasEdge('control module', 'gas valve')) missing.push('control module->gas valve edge');
    answer = `Valve/module relationship: control module -> gas valve${hasEdge('control module', 'gas valve') ? '' : ' not verified from structured wiring record'}.`;
  } else if (qtype === 'component_purpose') {
    answer = `Controlling component and role: control module controls gas valve opening/command path${hasEdge('control module', 'gas valve') ? '' : ' (valve control edge not verified)'}.`;
  } else if (qtype === 'canonical_components') {
    const components = Array.from(new Set([record, ...allRecords].flatMap((r) => r.canonical_components)));
    answer = `Canonical wiring components: ${components.join(', ')}.`;
  } else if (qtype === 'full_path_summary') {
    const full = buildFullPath(aggregateEdges);
    if (!full) missing.push('multi-edge power-to-valve path');
    answer = `Full path summary (power to valve): ${full || 'not verified from structured wiring records'}.`;
  } else if (qtype === 'connection_path') {
    answer = `Wiring connection path: ${formatEdges(aggregateEdges)}.`;
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

function mergeEdges(records: WiringRecord[]) {
  const map = new Map<string, WiringEdge>();
  for (const r of records) {
    for (const e of r.edges) {
      const k = `${e.from}|${e.to}`;
      if (!map.has(k)) map.set(k, e);
    }
  }
  return [...map.values()];
}

function buildFullPath(edges: WiringEdge[]) {
  const has = (f: string, t: string) => edges.some((e) => e.from === f && e.to === t);
  const parts: string[] = [];
  if (has('transformer', 'control module')) parts.push('transformer -> control module');
  else if (has('wall switch', 'control module')) parts.push('wall switch -> control module');
  if (has('receiver', 'control module')) parts.push('receiver/IFC -> control module');
  if (has('control module', 'gas valve')) parts.push('control module -> gas valve');
  return parts.length >= 2 ? parts.join(' -> ') : null;
}

function formatEdges(edges: WiringEdge[]) {
  return edges.map((e) => `${e.from} -> ${e.to}`).join('; ') || 'not verified';
}

function selectQuote(text: string) {
  const s = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  return (s.find((x) => /wiring|switch|module|ifc|receiver|transformer|valve|terminal/i.test(x)) || s[0] || text).split(/\s+/).slice(0, 32).join(' ');
}
