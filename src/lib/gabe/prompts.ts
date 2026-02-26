// GABE AI System Prompt Builder
// Used by both the API route and the client page

// Manual type definition
export interface Manual {
  id: string;
  brand: string;
  model: string;
  type: string;
  fileName: string;
  pages: number;
  uploadDate: string;
  category: string;
}

// Current uploaded manuals - this would come from a database in production
export const uploadedManuals: Manual[] = [
  { id: "1", brand: "Regency", model: "F1100", type: "Gas Insert", fileName: "Regency_F1100_Manual.pdf", pages: 48, uploadDate: "2025-01-15", category: "Gas Inserts" },
  { id: "2", brand: "Napoleon", model: "AS35", type: "Gas Stove", fileName: "Napoleon_AS35_Manual.pdf", pages: 36, uploadDate: "2025-01-10", category: "Gas Stoves" },
  { id: "3", brand: "Heat & Glo", model: "SLR", type: "Gas Fireplace", fileName: "HeatGlo_SLR_Manual.pdf", pages: 52, uploadDate: "2025-01-08", category: "Gas Fireplaces" },
  { id: "4", brand: "Vermont Castings", model: "Defiant", type: "Wood Stove", fileName: "VC_Defiant_Manual.pdf", pages: 44, uploadDate: "2024-12-20", category: "Wood Stoves" },
  { id: "5", brand: "Dimplex", model: "Opti-Myst", type: "Electric Fireplace", fileName: "Dimplex_OptiMyst_Manual.pdf", pages: 28, uploadDate: "2024-12-15", category: "Electric" },
  { id: "6", brand: "Majestic", model: "Ruby 36", type: "Gas Fireplace", fileName: "Majestic_Ruby36_Manual.pdf", pages: 40, uploadDate: "2024-12-10", category: "Gas Fireplaces" },
];

export function buildGabeSystemPrompt(jobContext?: {
  fireplace?: string;
  jobType?: string;
  jobId?: string;
}, manuals?: Manual[]) {
  const manualsList = manuals || uploadedManuals;
  
  const manualsBlock = `
## Available Manuals Library
You have access to the following uploaded manuals. When a technician asks about a specific model, reference the manual:
${manualsList.map(m => `- **${m.brand} ${m.model}** (${m.type}) — ${m.pages} pages, uploaded ${m.uploadDate}`).join("\n")}

IMPORTANT: When asked about a specific fireplace model that matches one of these manuals, reference the manual specs and provide model-specific guidance.
`;

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
${manualsBlock}
${contextBlock}
Always end troubleshooting answers with: "Need more help? Ask me to walk through it step by step."`;
}
