type VentRule = {
  pipe_type?: string;
  min_rise?: string;
  max_vertical?: string;
  max_horizontal?: string;
  constraint_flags: string[];
};

const WIRING_SYNONYMS: Record<string, string[]> = {
  "wall switch": ["wall switch", "switch"],
  "control module": ["control module", "module", "ifc", "receiver module"],
  "gas valve": ["gas valve", "valve"],
  "transformer": ["transformer"],
  "receiver": ["receiver", "remote receiver"],
  "igniter": ["igniter", "electrode", "spark igniter"],
};

const PART_ALIASES: Record<string, string[]> = {
  thermopile: ["thermopile", "pilot generator", "millivolt generator"],
  thermocouple: ["thermocouple", "pilot sensor"],
  module: ["control module", "ifc", "receiver module"],
  valve: ["gas valve", "valve assembly"],
  igniter: ["igniter", "electrode"],
};

export function extractVentRule(text: string): VentRule | null {
  const t = (text || "").toLowerCase();
  const out: VentRule = { constraint_flags: [] };
  const pipe = t.match(/\b(4\s*x\s*6|5\s*x\s*8|3\s*x\s*5)\b/i)?.[1];
  if (pipe) out.pipe_type = pipe.replace(/\s+/g, "");
  const minRise = t.match(/minimum\s+rise\s*(?:of)?\s*(\d+(?:\.\d+)?)\s*(ft|feet|in|"|inch|inches)/i);
  if (minRise) out.min_rise = `${minRise[1]} ${normalizeUnit(minRise[2])}`;
  const maxV = t.match(/max(?:imum)?\s+vertical\s*(?:run)?\s*(?:of)?\s*(\d+(?:\.\d+)?)\s*(ft|feet)/i);
  if (maxV) out.max_vertical = `${maxV[1]} ft`;
  const maxH = t.match(/max(?:imum)?\s+horizontal\s*(?:run)?\s*(?:of)?\s*(\d+(?:\.\d+)?)\s*(ft|feet)/i);
  if (maxH) out.max_horizontal = `${maxH[1]} ft`;
  if (/horizontal.*require.*vertical\s+rise|rise\s+before\s+horizontal/.test(t)) out.constraint_flags.push("rise_before_horizontal");
  if (/termination\s+clearance/.test(t)) out.constraint_flags.push("termination_clearance_rules");

  return out.pipe_type || out.min_rise || out.max_vertical || out.max_horizontal || out.constraint_flags.length ? out : null;
}

export function extractWiringGraph(text: string) {
  const t = (text || "").toLowerCase();
  const nodes = Object.keys(WIRING_SYNONYMS).filter((k) => WIRING_SYNONYMS[k].some((s) => t.includes(s)));
  const edges: Array<{ from: string; to: string }> = [];
  const has = (k: string) => nodes.includes(k);
  if (has("wall switch") && has("control module")) edges.push({ from: "wall switch", to: "control module" });
  if (has("control module") && has("gas valve")) edges.push({ from: "control module", to: "gas valve" });
  if (has("transformer") && has("control module")) edges.push({ from: "transformer", to: "control module" });
  if (has("receiver") && has("control module")) edges.push({ from: "receiver", to: "control module" });
  return { nodes, edges };
}

export function normalizePartNumbers(text: string) {
  const t = (text || "").toLowerCase();
  const raw = Array.from(new Set((t.match(/\b(?:[a-z]{0,3}-)?\d{3,6}[a-z0-9-]*\b/g) || [])));
  const aliases = Object.entries(PART_ALIASES)
    .filter(([, vals]) => vals.some((v) => t.includes(v)))
    .map(([k]) => k);
  return { part_numbers: raw.slice(0, 40), aliases };
}

function normalizeUnit(u: string) {
  const x = u.toLowerCase();
  if (x in { feet: 1, ft: 1 }) return "ft";
  return "in";
}
