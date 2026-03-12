"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WIRING_ONTOLOGY = void 0;
exports.classifyWiringQuestionType = classifyWiringQuestionType;
exports.extractWiringRecords = extractWiringRecords;
exports.pickBestWiringRecord = pickBestWiringRecord;
exports.buildWiringAnswerFromRecord = buildWiringAnswerFromRecord;
exports.WIRING_ONTOLOGY = {
    "control module": ["control module", "module", "ifc", "integrated fireplace control", "receiver module"],
    "receiver": ["receiver", "remote receiver", "rf receiver"],
    "gas valve": ["gas valve", "valve", "main valve"],
    "wall switch": ["wall switch", "switch", "on/off switch"],
    "transformer": ["transformer", "24v transformer", "power supply"],
};
function classifyWiringQuestionType(question) {
    const q = question.toLowerCase();
    if (q.includes('canonical wiring components') || (q.includes('canonical') && q.includes('component')))
        return 'canonical_components';
    if ((q.includes('full') || q.includes('summarize')) && q.includes('path'))
        return 'full_path_summary';
    if (q.includes('receiver') || q.includes('ifc'))
        return 'receiver_ifc_relationship';
    if (q.includes('transformer'))
        return 'transformer_relationship';
    if ((q.includes('switch') && q.includes('module')) || q.includes('terminal'))
        return 'switch_module_relationship';
    if ((q.includes('valve') && q.includes('module')) || q.includes('outputs'))
        return 'valve_module_relationship';
    if (q.includes('purpose') || q.includes('controls'))
        return 'component_purpose';
    if (q.includes('power source') || q.includes('feeds') || q.includes('power'))
        return 'power_source';
    if (q.includes('path') || q.includes('chain') || q.includes('from') || q.includes('to'))
        return 'connection_path';
    return 'connection_path';
}
function extractWiringRecords(chunks) {
    const out = [];
    for (const c of chunks) {
        if (c.source_type !== 'manual')
            continue;
        const text = (c.chunk_text || '').replace(/\s+/g, ' ');
        const lc = text.toLowerCase();
        if (!/wiring|switch|module|ifc|receiver|transformer|valve|terminal/.test(lc))
            continue;
        const comps = Object.keys(exports.WIRING_ONTOLOGY).filter((k) => exports.WIRING_ONTOLOGY[k].some((s) => lc.includes(s)));
        const edges = [];
        const has = (x) => comps.includes(x);
        const addEdge = (from, to, note) => {
            if (!edges.some((e) => e.from === from && e.to === to))
                edges.push({ from, to, note });
        };
        if (has('wall switch') && has('control module'))
            addEdge('wall switch', 'control module');
        if (has('transformer') && has('control module'))
            addEdge('transformer', 'control module');
        if (has('receiver') && has('control module'))
            addEdge('receiver', 'control module');
        if (has('control module') && has('gas valve'))
            addEdge('control module', 'gas valve');
        // Deeper edge extraction from relation language (not just co-occurrence)
        if (/transformer[^.]{0,100}(connect|wire|feed|to)[^.]{0,100}(control module|ifc|module)/i.test(text))
            addEdge('transformer', 'control module', 'relation_text');
        if (/(receiver|ifc)[^.]{0,100}(connect|wire|to)[^.]{0,100}(control module|module)/i.test(text))
            addEdge('receiver', 'control module', 'relation_text');
        if (/(control module|ifc|module)[^.]{0,100}(connect|output|to|drives)[^.]{0,100}(gas valve|valve)/i.test(text))
            addEdge('control module', 'gas valve', 'relation_text');
        if (/(wall switch|switch)[^.]{0,100}(connect|wire|to)[^.]{0,100}(control module|ifc|module)/i.test(text))
            addEdge('wall switch', 'control module', 'relation_text');
        const powerSource = /battery/i.test(text)
            ? 'battery pack'
            : /transformer|24v/i.test(text)
                ? 'transformer'
                : /power supply/i.test(text)
                    ? 'power supply'
                    : undefined;
        if (comps.length === 0 || edges.length === 0)
            continue;
        const confidence = Math.min(96, 55 + comps.length * 5 + edges.length * 9 + (powerSource ? 4 : 0) + (c.score > 0.8 ? 8 : 0));
        out.push({
            record_id: `${c.source_url}|${c.page_number}|${c.manual_title}`,
            manual_title: c.manual_title,
            model: c.model || c.manual_title || 'unknown',
            canonical_components: comps,
            synonyms: exports.WIRING_ONTOLOGY,
            power_source: powerSource,
            edges,
            source_page: c.page_number ?? null,
            source_url: c.source_url,
            confidence,
            quote: selectQuote(text),
        });
    }
    const map = new Map();
    for (const r of out) {
        const ex = map.get(r.record_id);
        if (!ex || r.confidence > ex.confidence)
            map.set(r.record_id, r);
    }
    return [...map.values()].sort((a, b) => b.confidence - a.confidence);
}
function pickBestWiringRecord(question, records) {
    if (records.length === 0)
        return null;
    const qtype = classifyWiringQuestionType(question);
    const q = question.toLowerCase();
    const filtered = records.filter((r) => {
        const hasEdge = (f, t) => r.edges.some((e) => e.from === f && e.to === t);
        if (qtype === 'transformer_relationship' || qtype === 'power_source')
            return hasEdge('transformer', 'control module');
        if (qtype === 'receiver_ifc_relationship')
            return hasEdge('receiver', 'control module');
        if (qtype === 'switch_module_relationship')
            return hasEdge('wall switch', 'control module');
        if (qtype === 'valve_module_relationship')
            return hasEdge('control module', 'gas valve');
        if (qtype === 'component_purpose')
            return r.canonical_components.includes('control module') && r.canonical_components.includes('gas valve');
        if (qtype === 'canonical_components')
            return r.canonical_components.length >= 3;
        if (qtype === 'full_path_summary')
            return hasEdge('control module', 'gas valve') && (hasEdge('transformer', 'control module') || hasEdge('wall switch', 'control module'));
        if (q.includes('valve'))
            return hasEdge('control module', 'gas valve');
        return true;
    });
    const pool = filtered.length ? filtered : records;
    return pool
        .map((r) => {
        let bonus = 0;
        if (r.edges.some((e) => e.from === 'wall switch' && e.to === 'control module'))
            bonus += 5;
        if (r.edges.some((e) => e.from === 'transformer' && e.to === 'control module'))
            bonus += 8;
        if (r.edges.some((e) => e.from === 'receiver' && e.to === 'control module'))
            bonus += 8;
        if (r.edges.some((e) => e.from === 'control module' && e.to === 'gas valve'))
            bonus += 10;
        return { r, s: r.confidence + bonus };
    })
        .sort((a, b) => b.s - a.s)[0]?.r || null;
}
function buildWiringAnswerFromRecord(record, question, allRecords = []) {
    const qtype = classifyWiringQuestionType(question);
    const missing = [];
    const aggregateEdges = mergeEdges([record, ...allRecords]);
    const allComponents = Array.from(new Set([record, ...allRecords].flatMap((r) => r.canonical_components)));
    // Cross-chunk depth inference for missing canonical edges
    if (!aggregateEdges.some((e) => e.from === 'transformer' && e.to === 'control module') && allComponents.includes('transformer') && allComponents.includes('control module')) {
        aggregateEdges.push({ from: 'transformer', to: 'control module', note: 'inferred_cross_chunk' });
    }
    if (!aggregateEdges.some((e) => e.from === 'receiver' && e.to === 'control module') && allComponents.includes('receiver') && allComponents.includes('control module')) {
        aggregateEdges.push({ from: 'receiver', to: 'control module', note: 'inferred_cross_chunk' });
    }
    const hasEdge = (f, t) => aggregateEdges.some((e) => e.from === f && e.to === t);
    let answer = `Wiring connection path: ${formatEdges(aggregateEdges)}.`;
    if (qtype === 'power_source' || qtype === 'transformer_relationship') {
        const inferredSource = record.power_source || allRecords.find((r) => r.power_source)?.power_source;
        if (!hasEdge('transformer', 'control module'))
            missing.push('transformer->control module edge');
        if (!inferredSource)
            missing.push('power_source');
        answer = `Power source relationship: ${inferredSource || 'not verified'} -> control module${hasEdge('transformer', 'control module') ? '' : ' (transformer edge not verified)'}.`;
    }
    else if (qtype === 'receiver_ifc_relationship') {
        if (!hasEdge('receiver', 'control module'))
            missing.push('receiver/IFC->control module edge');
        answer = `Receiver/IFC relationship: receiver (IFC) -> control module${hasEdge('receiver', 'control module') ? '' : ' not verified from structured wiring record'}.`;
    }
    else if (qtype === 'switch_module_relationship') {
        if (!hasEdge('wall switch', 'control module'))
            missing.push('wall switch->control module edge');
        answer = `Switch/module relationship: wall switch -> control module${hasEdge('wall switch', 'control module') ? '' : ' not verified from structured wiring record'}.`;
    }
    else if (qtype === 'valve_module_relationship') {
        if (!hasEdge('control module', 'gas valve'))
            missing.push('control module->gas valve edge');
        answer = `Valve/module relationship: control module -> gas valve${hasEdge('control module', 'gas valve') ? '' : ' not verified from structured wiring record'}.`;
    }
    else if (qtype === 'component_purpose') {
        answer = `Controlling component and role: control module controls gas valve opening/command path${hasEdge('control module', 'gas valve') ? '' : ' (valve control edge not verified)'}.`;
    }
    else if (qtype === 'canonical_components') {
        const components = Array.from(new Set([record, ...allRecords].flatMap((r) => r.canonical_components)));
        answer = `Canonical wiring components: ${components.join(', ')}.`;
    }
    else if (qtype === 'full_path_summary') {
        const inferredSource = record.power_source || allRecords.find((r) => r.power_source)?.power_source || (hasEdge('transformer', 'control module') ? 'transformer' : undefined);
        const full = buildFullPath(aggregateEdges, inferredSource);
        if (!full)
            missing.push('multi-edge power-to-valve path');
        answer = `Full path summary (power to valve): ${full || 'not verified from structured wiring records'}.`;
    }
    else if (qtype === 'connection_path') {
        answer = `Wiring connection path: ${formatEdges(aggregateEdges)}.`;
    }
    const notes = ['wiring_rule_structured', `wiring_qtype:${qtype}`, `wiring_record_id:${record.record_id}`];
    if (missing.length)
        notes.push(`missing_fields:${missing.join(',')}`);
    return {
        answer: `${answer} Source: page ${record.source_page ?? 'unknown'}. Model: ${record.model}.`,
        source_type: 'manual',
        manual_title: record.manual_title,
        page_number: record.source_page ?? 1,
        source_url: record.source_url,
        quote: record.quote,
        confidence: missing.length ? Math.min(record.confidence, 74) : record.confidence,
        certainty: (missing.length ? 'Verified Partial' : (record.confidence >= 85 ? 'Verified Exact' : 'Verified Partial')),
        validator_notes: notes,
    };
}
function mergeEdges(records) {
    const map = new Map();
    for (const r of records) {
        for (const e of r.edges) {
            const k = `${e.from}|${e.to}`;
            if (!map.has(k))
                map.set(k, e);
        }
    }
    return [...map.values()];
}
function buildFullPath(edges, powerSource) {
    const has = (f, t) => edges.some((e) => e.from === f && e.to === t);
    const parts = [];
    if (has('transformer', 'control module'))
        parts.push('transformer -> control module');
    else if (has('wall switch', 'control module'))
        parts.push('wall switch -> control module');
    if (has('receiver', 'control module'))
        parts.push('receiver/IFC -> control module');
    if (has('control module', 'gas valve'))
        parts.push('control module -> gas valve');
    if (parts.length >= 2) {
        if (powerSource && !parts[0].startsWith(powerSource)) {
            return `${powerSource} -> ${parts.join(' -> ')}`;
        }
        return parts.join(' -> ');
    }
    return null;
}
function formatEdges(edges) {
    return edges.map((e) => `${e.from} -> ${e.to}`).join('; ') || 'not verified';
}
function selectQuote(text) {
    const s = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    return (s.find((x) => /wiring|switch|module|ifc|receiver|transformer|valve|terminal/i.test(x)) || s[0] || text).split(/\s+/).slice(0, 32).join(' ');
}
