import { IntentCategory } from "./intentClassifier";

export type QueryResolution = {
  manufacturer_candidate?: string;
  model_candidate?: string;
  family_candidate?: string;
  size_candidate?: string;
  intent: IntentCategory;
  preferred_manual_type: "installation" | "owner" | "flyer" | "other";
  confidence: number;
  alternate_candidates: string[];
};

const MANUFACTURER_ALIASES: Record<string, string> = {
  "majestic products": "majestic",
  "fireplace xtrordinair": "fpx",
  "fireplacex": "fpx",
  "travis industries": "travis",
  "heat n glo": "heat & glo",
  "heatnglo": "heat & glo",
  "heat-glo": "heat & glo",
  "kozy": "kozy heat",
};

const MODEL_ALIASES: Record<string, string> = {
  "42 apex": "42 apex nexgen-hybrid",
  "apex 42": "42 apex nexgen-hybrid",
  "36 elite": "36 elite nexgen-hybrid",
  "answer nexgen": "answer nexgen-hybrid",
  "liberty nexgen": "liberty nexgen-hybrid",
  "rockport nexgen": "rockport nexgen-hybrid",
  "novus 36": "novus 36",
};

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function inferPreferredManualType(intent: IntentCategory): QueryResolution["preferred_manual_type"] {
  if (["framing", "venting", "clearances", "installation steps", "gas pressure"].includes(intent)) return "installation";
  if (["troubleshooting", "remote operation"].includes(intent)) return "owner";
  return "other";
}

export function resolveQuery(question: string, intent: IntentCategory): QueryResolution {
  const q = normalize(question);
  const alternates: string[] = [];

  let manufacturer: string | undefined;
  for (const key of Object.keys(MANUFACTURER_ALIASES)) {
    if (q.includes(key)) manufacturer = MANUFACTURER_ALIASES[key];
  }
  if (!manufacturer) {
    const direct = ["majestic", "monessen", "heatilator", "heat & glo", "kozy heat", "napoleon", "travis", "fpx", "lopi", "regency", "valor"];
    manufacturer = direct.find((b) => q.includes(b));
  }

  let model: string | undefined;
  for (const [alias, canonical] of Object.entries(MODEL_ALIASES)) {
    if (q.includes(alias)) {
      model = canonical;
      alternates.push(alias);
    }
  }

  if (!model) {
    const patterns = [
      /\b(\d{2}\s*apex(?:\s*nexgen(?:-hybrid)?)?)\b/i,
      /\b(\d{2}\s*elite(?:\s*nexgen(?:-hybrid)?)?)\b/i,
      /\b(novus\s*\d{2})\b/i,
      /\b(probuilder\s*\d+)\b/i,
      /\b(answer\s*nexgen(?:-hybrid)?)\b/i,
      /\b(liberty\s*nexgen(?:-hybrid)?)\b/i,
      /\b(rockport\s*nexgen(?:-hybrid)?)\b/i,
    ];
    model = patterns.map((r) => q.match(r)?.[1]).find(Boolean);
  }

  const family = q.includes("apex") ? "apex" : q.includes("elite") ? "elite" : q.includes("novus") ? "novus" : undefined;
  const size = q.match(/\b(\d{2})\b/)?.[1];

  const confidence = manufacturer && model ? 0.92 : model ? 0.72 : manufacturer ? 0.6 : 0.28;

  return {
    manufacturer_candidate: manufacturer,
    model_candidate: model,
    family_candidate: family,
    size_candidate: size,
    intent,
    preferred_manual_type: inferPreferredManualType(intent),
    confidence,
    alternate_candidates: Array.from(new Set(alternates)),
  };
}
