export type ModelDetection = {
  brand?: string;
  model?: string;
  type?: string;
  confidence: number;
  clarificationQuestion?: string;
};

const BRANDS = ["majestic", "travis", "fpx", "lopi", "kozy", "kozy heat", "napoleon", "heatilator", "heat & glo", "regency", "valor", "monessen"];

export function detectModel(question: string): ModelDetection {
  const q = question.toLowerCase();
  const brand = BRANDS.find((b) => q.includes(b));

  const modelPatterns = [
    /\b(\d{2}\s*apex(?:\s*nexgen(?:-hybrid)?)?)\b/i,
    /\b(\d{2}\s*elite(?:\s*nexgen(?:-hybrid)?)?)\b/i,
    /\b(answer\s*nexgen(?:-hybrid)?)\b/i,
    /\b(liberty\s*nexgen(?:-hybrid)?)\b/i,
    /\b(rockport\s*nexgen(?:-hybrid)?)\b/i,
    /\b(probuilder\s*\d+)\b/i,
    /\b(echelon\s*ii(?:\s*st)?)\b/i,
    /\b(carlton\s*\d+)\b/i,
  ];

  const model = modelPatterns.map((r) => q.match(r)?.[1]).find(Boolean);
  const type = q.includes("see-through") ? "See-through gas fireplace" : undefined;

  if (brand && model) return { brand: normalizeBrand(brand), model: model.trim(), type, confidence: 0.9 };
  if (brand && !model) {
    return {
      brand: normalizeBrand(brand),
      confidence: 0.55,
      clarificationQuestion: `I found brand ${normalizeBrand(brand)}. Which model are you working on?`,
    };
  }
  return { confidence: 0.2, clarificationQuestion: "Please provide fireplace brand and model for an accurate answer." };
}

function normalizeBrand(b: string) {
  if (b === "fpx") return "FPX";
  if (b === "kozy") return "Kozy Heat";
  return b.replace(/\b\w/g, (m) => m.toUpperCase());
}
