// GABE AI System Prompt Builder
// Used by both the API route and the client page

export const manualKnowledgeBase = "Majestic Lopi FPX Napoleon Kozy Heat Monessen";

type ManualContext = {
  manuals?: Array<{
    id: string;
    brand: string;
    model: string;
    type?: string | null;
    category?: string | null;
    url: string;
    pages?: number | null;
  }>;
  sections?: Array<{
    manualId: string;
    pageStart: number;
    pageEnd?: number | null;
    title?: string | null;
    snippet: string;
  }>;
};

function buildManualsBlock(manualContext?: ManualContext) {
  const manuals = manualContext?.manuals ?? [];
  const sections = manualContext?.sections ?? [];

  const manualLines = manuals.map((m) => {
    const type = m.type ? ` — ${m.type}` : "";
    const category = m.category ? ` (${m.category})` : "";
    const pages = m.pages ? ` — ${m.pages} pages` : "";
    return `- [${m.id}] ${m.brand} ${m.model}${type}${category}${pages} — ${m.url}`;
  });

  const sectionLines = sections.map((s) => {
    const pageEnd = s.pageEnd && s.pageEnd !== s.pageStart ? `–${s.pageEnd}` : "";
    const title = s.title ? ` (${s.title})` : "";
    return `- [${s.manualId}] p. ${s.pageStart}${pageEnd}${title}: ${s.snippet}`;
  });

  if (manualLines.length === 0 && sectionLines.length === 0) return "";

  return `
## Manuals Library
${manualLines.length > 0 ? manualLines.join("\n") : "- None"}

## Manual Excerpts (for citations)
${sectionLines.length > 0 ? sectionLines.join("\n") : "- None"}

## Citation Format
When you use manual excerpts, add a "Citations" section at the end with bullets like:
- [Manual: Brand Model, p. 12] URL
Only cite manuals you actually used. Never invent page numbers.`;
}

export function buildGabeSystemPrompt(
  jobContext?: {
    fireplace?: string;
    jobType?: string;
    jobId?: string;
  },
  manualContext?: ManualContext
) {
  const contextBlock = jobContext?.fireplace
    ? `
## Current Job Context
The technician is currently on a job. Use this context to give specific, relevant answers:
- **Fireplace Unit**: ${jobContext.fireplace}
- **Job Type**: ${jobContext.jobType || "Service Call"}
- **Job ID**: ${jobContext.jobId || "Unknown"}

Always reference the specific unit when answering. If you know the model, reference its manual specs.
`
    : "";

  return `You are GABE (Gas Appliance & Burner Expert), an AI assistant for HearthOS — a field service management platform for fireplace installation and service companies.

## Your Role
You are a highly experienced fireplace technician with 20+ years of expertise in:
- Gas fireplace installation, service, and repair
- Direct vent, B-vent, and vent-free systems
- Brands: Regency, Napoleon, Heatilator, Heat & Glo, Majestic, Mendota, Valor, Fireplace Xtrordinair
- Gas line sizing, venting calculations, clearance requirements
- Troubleshooting: pilot issues, ignition, thermocouples, thermopiles, gas valves
- Safety: CO detection, gas leak testing, proper combustion
- Parts identification and pricing

## Guidelines
- Give direct, actionable answers — technicians are in the field
- Use numbered steps for procedures
- Include part numbers or specs when relevant
- Flag safety concerns prominently with ⚠️
- Reference manufacturer specs when possible
- Keep answers concise but complete
- If unsure, say so and recommend consulting the manual or manufacturer
${contextBlock}
${buildManualsBlock(manualContext)}

Always end troubleshooting answers with: "Need more help? Ask me to walk through it step by step."`;
}
