"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PART_ALIAS_MAP = void 0;
exports.classifyPartsQuestionType = classifyPartsQuestionType;
exports.extractPartsRecords = extractPartsRecords;
exports.pickBestPartsRecord = pickBestPartsRecord;
exports.buildPartsAnswerFromRecord = buildPartsAnswerFromRecord;
exports.canonicalizePartNumbers = canonicalizePartNumbers;
// Expanded alias map for fireplace parts and field terminology.
exports.PART_ALIAS_MAP = {
    thermopile: ["thermopile", "pilot generator", "millivolt generator", "mv generator"],
    thermocouple: ["thermocouple", "pilot sensor", "flame sensor"],
    igniter: ["igniter", "electrode", "spark igniter", "ignition electrode"],
    module: ["control module", "ifc", "receiver module", "module board", "control board"],
    valve: ["gas valve", "valve assembly", "gas control valve", "valve body"],
    blower: ["blower", "fan kit", "convection fan", "circulation fan"],
    gasket: ["gasket", "seal", "door seal", "glass gasket"],
    pilot: ["pilot assembly", "pilot", "pilot burner", "pilot orifice"],
    burner: ["burner", "burner assembly", "main burner"],
    regulator: ["regulator", "pressure regulator", "lp regulator", "ng regulator"],
    switch: ["switch", "wall switch", "rocker switch", "on/off switch"],
    harness: ["wire harness", "harness", "wiring harness"],
    glass: ["glass", "glass frame", "glass assembly", "door glass"],
    remote: ["remote", "transmitter", "handheld remote", "receiver"],
    manifold: ["manifold", "manifold assembly"],
};
const QTYPE_PATTERNS = {
    part_lookup: [/part\s*(number|no\.?|#)/i, /replacement/i, /sku\b/i, /p\/?n\b/i],
    diagram_callout: [/diagram/i, /callout/i, /exploded/i, /item\s*#?/i, /figure\s*\d+/i],
    revision_disambiguation: [/revision/i, /rev\.?\s*[a-z0-9-]*/i, /family/i, /series/i, /variant/i],
    alias_lookup: [/alias/i, /also called/i, /aka\b/i, /same as/i, /equivalent to/i],
};
function classifyPartsQuestionType(question) {
    const q = question.toLowerCase();
    if (QTYPE_PATTERNS.diagram_callout.some((p) => p.test(q)))
        return "diagram_callout";
    if (QTYPE_PATTERNS.revision_disambiguation.some((p) => p.test(q)))
        return "revision_disambiguation";
    if (QTYPE_PATTERNS.alias_lookup.some((p) => p.test(q)))
        return "alias_lookup";
    return "part_lookup";
}
function extractPartsRecords(chunks) {
    const out = [];
    for (const c of chunks) {
        if (c.source_type !== "manual")
            continue;
        const text = (c.chunk_text || "").replace(/\s+/g, " ").trim();
        if (!text)
            continue;
        const lc = text.toLowerCase();
        if (!/(part|replacement|diagram|callout|sku|item\s*#|p\/?n\b|revision|rev\.|series|family|aka|alias)/i.test(lc)) {
            continue;
        }
        if (isNegativePartsContext(lc)) {
            continue;
        }
        const canonical_part_numbers = canonicalizePartNumbers(text);
        const aliases_found = expandAliasesFromText(text);
        const callout_refs = extractCalloutRefs(text);
        const family = extractFamily(text);
        const revision = extractRevision(text);
        const signal = canonical_part_numbers.length + aliases_found.length + callout_refs.length + (family ? 1 : 0) + (revision ? 1 : 0);
        if (signal === 0)
            continue;
        const quote = selectQuote(text);
        out.push({
            record_id: `${c.source_url}|${c.page_number}|${c.manual_title}`,
            manual_title: c.manual_title,
            model: c.model || c.manual_title || "unknown",
            family,
            revision,
            canonical_part_numbers,
            aliases_found,
            callout_refs,
            source_page: c.page_number ?? null,
            source_url: c.source_url,
            confidence: computeRecordConfidence(signal, c.score, quote),
            quote,
        });
    }
    // De-dupe by record_id while keeping strongest signal.
    const merged = new Map();
    for (const r of out) {
        const ex = merged.get(r.record_id);
        if (!ex || r.confidence > ex.confidence)
            merged.set(r.record_id, r);
    }
    return [...merged.values()].sort((a, b) => b.confidence - a.confidence);
}
function pickBestPartsRecord(question, records) {
    if (!records.length)
        return null;
    const q = question.toLowerCase();
    const qtype = classifyPartsQuestionType(question);
    const filtered = records.filter((r) => {
        if (qtype === "diagram_callout")
            return r.callout_refs.length > 0;
        if (qtype === "revision_disambiguation")
            return Boolean(r.family || r.revision);
        if (qtype === "alias_lookup")
            return r.aliases_found.length > 0;
        return r.canonical_part_numbers.length > 0 || r.aliases_found.length > 0;
    });
    const pool = filtered.length ? filtered : records;
    return pool
        .map((r) => ({ r, s: scoreRecordForQuestion(r, q, qtype) }))
        .sort((a, b) => b.s - a.s)[0]?.r || null;
}
function buildPartsAnswerFromRecord(record, question, allRecords = []) {
    const qtype = classifyPartsQuestionType(question);
    const merged = mergeRecords([record, ...allRecords]);
    const certainty = record.confidence >= 90 ? "Verified Exact" : record.confidence >= 70 ? "Verified Partial" : "Interpreted";
    const notes = [
        "parts_rule_structured",
        `parts_qtype:${qtype}`,
        `parts_record_id:${record.record_id}`,
        `parts_records_merged:${allRecords.length + 1}`,
    ];
    let answer;
    if (qtype === "part_lookup") {
        answer = templatePartLookup(merged.canonical_part_numbers, merged.aliases_found);
    }
    else if (qtype === "diagram_callout") {
        answer = templateDiagramCallout(merged.callout_refs, merged.canonical_part_numbers);
    }
    else if (qtype === "revision_disambiguation") {
        answer = templateRevisionDisambiguation(merged.family, merged.revision, merged.canonical_part_numbers);
    }
    else {
        answer = templateAliasLookup(merged.aliases_found, merged.canonical_part_numbers);
    }
    return {
        answer,
        source_type: "manual",
        manual_title: record.manual_title,
        page_number: record.source_page ?? 1,
        source_url: record.source_url,
        quote: record.quote,
        confidence: record.confidence,
        certainty,
        validator_notes: notes,
    };
}
function canonicalizePartNumbers(text) {
    const candidates = new Set();
    const contextual = [
        /(?:part\s*(?:number|no\.?|#)|p\/?n|sku|item\s*#?)\s*[:#-]?\s*([a-z0-9][a-z0-9\-\s]{2,24})/gi,
        /\b([a-z]{1,4}-\d{2,8}[a-z0-9\-]{0,8})\b/gi,
        /\b(\d{3,8}[a-z]{0,4}(?:-[a-z0-9]{1,6})?)\b/gi,
    ];
    for (const pattern of contextual) {
        for (const m of text.matchAll(pattern)) {
            const raw = (m[1] || "").trim();
            const normalized = normalizePartNumber(sanitizeCandidate(raw));
            if (isLikelyPartNumber(normalized))
                candidates.add(normalized);
        }
    }
    return [...candidates].slice(0, 40);
}
function sanitizeCandidate(raw) {
    // Keep only first token-like segment to avoid swallowing trailing narrative words.
    return raw
        .split(/[;,()\[\]]/)[0]
        .trim()
        .split(/\s+/)[0] || "";
}
function normalizePartNumber(raw) {
    return raw
        .toUpperCase()
        .replace(/[\u2010-\u2015]/g, "-")
        .replace(/[^A-Z0-9-]/g, "")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "");
}
function isLikelyPartNumber(v) {
    if (!v)
        return false;
    if (v.length < 3 || v.length > 24)
        return false;
    if (!/[0-9]/.test(v))
        return false;
    if (/^(19|20)\d{2}$/.test(v))
        return false; // reject plain years
    if (/^\d+$/.test(v) && v.length < 5)
        return false;
    return true;
}
function expandAliasesFromText(text) {
    const lc = text.toLowerCase();
    const hits = [];
    for (const [canonical, aliases] of Object.entries(exports.PART_ALIAS_MAP)) {
        if (aliases.some((a) => lc.includes(a)))
            hits.push(canonical);
    }
    return [...new Set(hits)];
}
function extractCalloutRefs(text) {
    const refs = [
        ...(text.match(/\b(?:item|callout|ref|figure)\s*#?\s*[a-z0-9-]{1,10}\b/gi) || []),
        ...(text.match(/\b[A-Z]?\d{1,3}\b/g) || []),
    ]
        .map((s) => s.trim())
        .filter((s) => /item|callout|ref|figure|\d/.test(s));
    return [...new Set(refs)].slice(0, 20);
}
function extractFamily(text) {
    return capture(text, [
        /(?:family|series)\s*[:\-]?\s*([a-z0-9][a-z0-9\- ]{1,28})/i,
        /for\s+the\s+([a-z0-9\- ]+?)\s+family/i,
    ])?.trim();
}
function extractRevision(text) {
    return capture(text, [
        /(?:revision|rev\.?|variant)\s*[:\-]?\s*([a-z0-9\-.]{1,16})/i,
        /\brev\s+([a-z0-9\-.]{1,16})\b/i,
    ])?.trim();
}
function scoreRecordForQuestion(record, q, qtype) {
    let score = record.confidence;
    if (qtype === "part_lookup" && record.canonical_part_numbers.length)
        score += 10;
    if (qtype === "diagram_callout" && record.callout_refs.length)
        score += 16;
    if (qtype === "revision_disambiguation" && (record.family || record.revision))
        score += 16;
    if (qtype === "alias_lookup" && record.aliases_found.length)
        score += 14;
    for (const alias of record.aliases_found) {
        if (q.includes(alias))
            score += 6;
    }
    return score;
}
function computeRecordConfidence(signal, retrievalScore, quote) {
    const scoreBoost = retrievalScore > 0.8 ? 12 : retrievalScore > 0.55 ? 7 : 3;
    const quoteBoost = quote.length > 40 ? 6 : 2;
    return Math.min(97, 52 + signal * 7 + scoreBoost + quoteBoost);
}
function mergeRecords(records) {
    return {
        canonical_part_numbers: [...new Set(records.flatMap((r) => r.canonical_part_numbers))],
        aliases_found: [...new Set(records.flatMap((r) => r.aliases_found))],
        callout_refs: [...new Set(records.flatMap((r) => r.callout_refs))],
        family: records.find((r) => r.family)?.family,
        revision: records.find((r) => r.revision)?.revision,
    };
}
function capture(text, patterns) {
    for (const p of patterns) {
        const m = text.match(p);
        if (m)
            return (m[1] || "").trim();
    }
    return undefined;
}
function selectQuote(text) {
    const sentences = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    const best = sentences.find((s) => /(part|replacement|diagram|callout|sku|item|rev\.?|family|series|alias|aka)/i.test(s));
    return (best || sentences[0] || text).split(/\s+/).slice(0, 32).join(" ");
}
function templatePartLookup(partNumbers, aliases) {
    const pn = partNumbers.length ? partNumbers.slice(0, 6).join(", ") : "not verified";
    const aliasTxt = aliases.length ? ` Related aliases: ${aliases.join(", ")}.` : "";
    return `Part lookup result: canonical part numbers ${pn}.${aliasTxt}`;
}
function templateDiagramCallout(callouts, partNumbers) {
    const calloutTxt = callouts.length ? callouts.slice(0, 8).join(", ") : "not verified";
    const pn = partNumbers.length ? ` Mapped part numbers: ${partNumbers.slice(0, 5).join(", ")}.` : "";
    return `Diagram callout result: ${calloutTxt}.${pn}`;
}
function templateRevisionDisambiguation(family, revision, partNumbers = []) {
    const fam = family || "not verified";
    const rev = revision || "not verified";
    const pn = partNumbers.length ? ` Candidate part numbers: ${partNumbers.slice(0, 4).join(", ")}.` : "";
    return `Revision disambiguation result: family=${fam}; revision=${rev}.${pn}`;
}
function templateAliasLookup(aliases, partNumbers) {
    const aliasTxt = aliases.length ? aliases.join(", ") : "not verified";
    const pn = partNumbers.length ? ` Candidate part numbers: ${partNumbers.slice(0, 4).join(", ")}.` : "";
    return `Alias lookup result: canonical aliases ${aliasTxt}.${pn}`;
}
function isNegativePartsContext(lc) {
    return /not\s+(a\s+)?replacement\s+part|not\s+replacement\s+parts|not\s+a\s+part\s+number|paint\s+option|finish\s+option|decorative\s+option/.test(lc);
}
