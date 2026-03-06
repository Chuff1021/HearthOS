import { RetrievedChunk } from "../types";

export type ComplianceQType =
  | "listing"
  | "approval"
  | "inspection"
  | "permit"
  | "code_vs_manufacturer"
  | "clearance_compliance";

export type ComplianceRecord = {
  record_id: string;
  qtype: ComplianceQType;
  manual_title: string;
  model: string;
  source_page: number | null;
  source_url: string;
  quote: string;
  compliance_markers: string[];
  confidence: number;
};

const MARKERS = {
  listing: [/\blisted\b/i, /listing/i, /ansi\b/i, /ul\b/i, /csa\b/i],
  approval: [/\bapproved\b/i, /\bapproval\b/i, /\bcertified\b/i, /certification/i],
  inspection: [/\binspection\b/i, /inspect(ed|ion)?/i, /authority having jurisdiction/i, /ahj\b/i],
  requirement: [/manufacturer requires?/i, /must\b/i, /shall\b/i, /requirement/i],
};

export function classifyComplianceQuestionType(question: string): ComplianceQType {
  const q = question.toLowerCase();
  if (/listing|ul|csa|ansi/.test(q)) return "listing";
  if (/approved|approval|certified|certification/.test(q)) return "approval";
  if (/inspection|inspect|ahj|authority having jurisdiction/.test(q)) return "inspection";
  if (/permit|permitting/.test(q)) return "permit";
  if (/code\s*(vs|versus)|local code|manufacturer requirement|code requirement/.test(q)) return "code_vs_manufacturer";
  return "clearance_compliance";
}

export function extractComplianceRecords(chunks: RetrievedChunk[], question: string): ComplianceRecord[] {
  const qtype = classifyComplianceQuestionType(question);
  const out: ComplianceRecord[] = [];

  for (const c of chunks) {
    if (c.source_type !== "manual") continue;
    const text = (c.chunk_text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const markers = collectMarkers(text);
    if (!hasRequiredExplicitMarkers(qtype, text, markers)) continue;

    const quote = selectComplianceQuote(text, qtype);
    if (!quote) continue;

    const markerBoost = Math.min(20, markers.length * 4);
    const scoreBoost = c.score > 0.8 ? 12 : c.score > 0.6 ? 8 : 4;
    const confidence = Math.min(97, 58 + markerBoost + scoreBoost);

    out.push({
      record_id: `${c.source_url}|${c.page_number}|${c.manual_title}`,
      qtype,
      manual_title: c.manual_title,
      model: c.model || c.manual_title || "unknown",
      source_page: c.page_number ?? null,
      source_url: c.source_url,
      quote,
      compliance_markers: markers,
      confidence,
    });
  }

  const merged = new Map<string, ComplianceRecord>();
  for (const r of out) {
    const ex = merged.get(r.record_id);
    if (!ex || r.confidence > ex.confidence) merged.set(r.record_id, r);
  }

  return [...merged.values()].sort((a, b) => b.confidence - a.confidence);
}

export function pickBestComplianceRecord(question: string, records: ComplianceRecord[]): ComplianceRecord | null {
  if (!records.length) return null;
  const qtype = classifyComplianceQuestionType(question);
  const q = question.toLowerCase();

  return records
    .map((r) => {
      let s = r.confidence;
      if (r.qtype === qtype) s += 15;
      if (q.includes("clearance") && r.compliance_markers.some((m) => m.includes("requirement") || m.includes("listed"))) s += 8;
      if (q.includes("permit") && r.compliance_markers.some((m) => m.includes("inspection"))) s += 6;
      return { r, s };
    })
    .sort((a, b) => b.s - a.s)[0]?.r || null;
}

export function buildComplianceAnswerFromRecord(record: ComplianceRecord, question: string) {
  const qtype = classifyComplianceQuestionType(question);
  const certainty = record.confidence >= 90 ? "Verified Exact" : "Verified Partial";

  return {
    answer: templateFor(qtype, record.model),
    source_type: "manual" as const,
    manual_title: record.manual_title,
    page_number: record.source_page ?? 1,
    source_url: record.source_url,
    quote: record.quote,
    confidence: record.confidence,
    certainty,
    run_outcome: "approved_compliance",
    validator_notes: [
      "compliance_rule_structured",
      `compliance_qtype:${qtype}`,
      `compliance_record_id:${record.record_id}`,
      `compliance_markers:${record.compliance_markers.join("|")}`,
      "manufacturer_vs_code_boundary:enforced",
    ],
  };
}

export function buildComplianceRefusal(question: string, reason = "missing_explicit_compliance_markers") {
  const qtype = classifyComplianceQuestionType(question);
  return {
    answer:
      "I can’t verify this compliance claim from explicit manufacturer listing/approval/inspection language in the loaded manuals. I can cite manufacturer requirements only; local code/permit interpretation must be confirmed with AHJ.",
    source_type: "none" as const,
    confidence: 0,
    certainty: "Unverified" as const,
    run_outcome: "refused_missing_explicit_support",
    validator_notes: [reason, `compliance_qtype:${qtype}`, "refusal_first_template"],
  };
}

function templateFor(qtype: ComplianceQType, model: string) {
  if (qtype === "listing") {
    return `Manufacturer listing language found for ${model}. This is a manufacturer listing statement, not a local code ruling.`;
  }
  if (qtype === "approval") {
    return `Manufacturer approval/certification language found for ${model}. This confirms manufacturer approval terms only.`;
  }
  if (qtype === "inspection") {
    return `Manufacturer inspection-related language found for ${model}. Local inspection acceptance remains AHJ-controlled.`;
  }
  if (qtype === "permit") {
    return `Manufacturer guidance relevant to permit context found for ${model}. Permit determination is local jurisdiction/AHJ scope.`;
  }
  if (qtype === "code_vs_manufacturer") {
    return `Manufacturer requirement language found for ${model}. Manufacturer requirements are cited; local code interpretation must be confirmed with AHJ.`;
  }
  return `Manufacturer clearance requirement language found for ${model}. This is manufacturer compliance guidance, not a final local code determination.`;
}

function hasRequiredExplicitMarkers(qtype: ComplianceQType, text: string, markers: string[]) {
  const lc = text.toLowerCase();
  const hasAnyExplicit = markers.length > 0;
  const hasRequirement = MARKERS.requirement.some((p) => p.test(lc));
  const hasListingApprovalInspection =
    MARKERS.listing.some((p) => p.test(lc)) || MARKERS.approval.some((p) => p.test(lc)) || MARKERS.inspection.some((p) => p.test(lc));

  if (!hasAnyExplicit) return false;

  if (qtype === "clearance_compliance") {
    const clearanceMention = /clearance|combustible|distance|minimum\s+clearance/i.test(lc);
    return clearanceMention && (hasRequirement || hasListingApprovalInspection);
  }

  if (qtype === "permit") {
    return /permit|inspection|ahj|authority having jurisdiction/i.test(lc) && hasListingApprovalInspection;
  }

  if (qtype === "code_vs_manufacturer") {
    return hasRequirement && (/code|ahj|authority having jurisdiction|\bauthority\b/i.test(lc) || hasListingApprovalInspection);
  }

  return hasListingApprovalInspection || hasRequirement;
}

function collectMarkers(text: string) {
  const markers: string[] = [];
  for (const [name, patterns] of Object.entries(MARKERS)) {
    for (const p of patterns) {
      if (p.test(text)) markers.push(name);
    }
  }
  return [...new Set(markers)];
}

function selectComplianceQuote(text: string, qtype: ComplianceQType) {
  const sents = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const best = sents.find((s) => hasRequiredExplicitMarkers(qtype, s, collectMarkers(s)));
  return (best || sents[0] || "").split(/\s+/).slice(0, 34).join(" ");
}
