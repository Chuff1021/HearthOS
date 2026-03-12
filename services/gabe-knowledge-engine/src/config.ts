import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("4100"),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().default("llama-3.1-8b-instant"),
  QDRANT_URL: z.string().url(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default("fireplace_manuals"),
  QDRANT_DIAGRAM_COLLECTION: z.string().default("fireplace_diagrams"),
  EMBEDDINGS_PROVIDER: z.enum(["transformers", "openai", "jina"]).default("transformers"),
  OPENAI_API_KEY: z.string().optional(),
  JINA_API_KEY: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  ALLOWLIST_DOMAINS: z.string().default(
    [
      "kozyheat.com",
      "travisindustries.com",
      "majesticproducts.com",
      "napoleon.com",
      "hearthnhome.com",
      "empirecomfort.com",
      "ihp.us.com",
      "fire-parts.com",
      "energypartsplus.com"
    ].join(",")
  ),
  SIMILARITY_THRESHOLD: z.string().default("0.78"),
  MIN_EVIDENCE_CHUNKS: z.string().default("1"),
  MANUAL_SELECTION_MIN_MARGIN: z.string().default("0.01"),
  MANUALS_PATH: z.string().default("/var/lib/gabe/manuals"),
  LOG_LEVEL: z.string().default("info"),
  RESOLVER_CONFIDENCE_MIN: z.string().default("0.6"),
  REGISTRY_MATCH_CONFIDENCE_MIN: z.string().default("1.5"),
  EXACT_MODEL_OVERRIDE: z.string().default("true"),
  FAMILY_ONLY_FALLBACK_ALLOWED: z.string().default("false"),
  INSTALL_INTENT_REQUIRES_INSTALL_MANUAL: z.string().default("true"),
  MAX_MANUAL_CANDIDATES: z.string().default("6"),
  INSTALL_STRICT_MANUAL_ID_ONLY: z.string().default("true")
});

export const env = envSchema.parse({
  PORT: process.env.PORT,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL,
  QDRANT_URL: process.env.QDRANT_URL,
  QDRANT_API_KEY: process.env.QDRANT_API_KEY,
  QDRANT_COLLECTION: process.env.QDRANT_COLLECTION,
  QDRANT_DIAGRAM_COLLECTION: process.env.QDRANT_DIAGRAM_COLLECTION,
  EMBEDDINGS_PROVIDER: process.env.EMBEDDINGS_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  JINA_API_KEY: process.env.JINA_API_KEY,
  BRAVE_API_KEY: process.env.BRAVE_API_KEY,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  ALLOWLIST_DOMAINS: process.env.ALLOWLIST_DOMAINS,
  SIMILARITY_THRESHOLD: process.env.SIMILARITY_THRESHOLD,
  MIN_EVIDENCE_CHUNKS: process.env.MIN_EVIDENCE_CHUNKS,
  MANUAL_SELECTION_MIN_MARGIN: process.env.MANUAL_SELECTION_MIN_MARGIN,
  MANUALS_PATH: process.env.MANUALS_PATH,
  LOG_LEVEL: process.env.LOG_LEVEL,
  RESOLVER_CONFIDENCE_MIN: process.env.RESOLVER_CONFIDENCE_MIN,
  REGISTRY_MATCH_CONFIDENCE_MIN: process.env.REGISTRY_MATCH_CONFIDENCE_MIN,
  EXACT_MODEL_OVERRIDE: process.env.EXACT_MODEL_OVERRIDE,
  FAMILY_ONLY_FALLBACK_ALLOWED: process.env.FAMILY_ONLY_FALLBACK_ALLOWED,
  INSTALL_INTENT_REQUIRES_INSTALL_MANUAL: process.env.INSTALL_INTENT_REQUIRES_INSTALL_MANUAL,
  MAX_MANUAL_CANDIDATES: process.env.MAX_MANUAL_CANDIDATES,
  INSTALL_STRICT_MANUAL_ID_ONLY: process.env.INSTALL_STRICT_MANUAL_ID_ONLY
});

export const allowlistDomains = env.ALLOWLIST_DOMAINS.split(",").map((d) => d.trim()).filter(Boolean);
export const similarityThreshold = Number(env.SIMILARITY_THRESHOLD);
export const minEvidenceChunks = Number(env.MIN_EVIDENCE_CHUNKS);
export const manualSelectionMinMargin = Number(env.MANUAL_SELECTION_MIN_MARGIN);
export const resolverConfidenceMin = Number(env.RESOLVER_CONFIDENCE_MIN);
export const registryMatchConfidenceMin = Number(env.REGISTRY_MATCH_CONFIDENCE_MIN);
export const exactModelOverride = String(env.EXACT_MODEL_OVERRIDE).toLowerCase() === "true";
export const familyOnlyFallbackAllowed = String(env.FAMILY_ONLY_FALLBACK_ALLOWED).toLowerCase() === "true";
export const installIntentRequiresInstallManual = String(env.INSTALL_INTENT_REQUIRES_INSTALL_MANUAL).toLowerCase() === "true";
export const maxManualCandidates = Number(env.MAX_MANUAL_CANDIDATES);
export const installStrictManualIdOnly = String(env.INSTALL_STRICT_MANUAL_ID_ONLY).toLowerCase() === "true";
