import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("4100"),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().default("llama-3.1-8b-instant"),
  QDRANT_URL: z.string().url(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default("gabe_manual_chunks"),
  EMBEDDINGS_PROVIDER: z.enum(["transformers", "openai", "jina"]).default("transformers"),
  OPENAI_API_KEY: z.string().optional(),
  JINA_API_KEY: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),
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
  LOG_LEVEL: z.string().default("info")
});

export const env = envSchema.parse({
  PORT: process.env.PORT,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL,
  QDRANT_URL: process.env.QDRANT_URL,
  QDRANT_API_KEY: process.env.QDRANT_API_KEY,
  QDRANT_COLLECTION: process.env.QDRANT_COLLECTION,
  EMBEDDINGS_PROVIDER: process.env.EMBEDDINGS_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  JINA_API_KEY: process.env.JINA_API_KEY,
  BRAVE_API_KEY: process.env.BRAVE_API_KEY,
  ALLOWLIST_DOMAINS: process.env.ALLOWLIST_DOMAINS,
  SIMILARITY_THRESHOLD: process.env.SIMILARITY_THRESHOLD,
  MIN_EVIDENCE_CHUNKS: process.env.MIN_EVIDENCE_CHUNKS,
  MANUAL_SELECTION_MIN_MARGIN: process.env.MANUAL_SELECTION_MIN_MARGIN,
  MANUALS_PATH: process.env.MANUALS_PATH,
  LOG_LEVEL: process.env.LOG_LEVEL
});

export const allowlistDomains = env.ALLOWLIST_DOMAINS.split(",").map((d) => d.trim()).filter(Boolean);
export const similarityThreshold = Number(env.SIMILARITY_THRESHOLD);
export const minEvidenceChunks = Number(env.MIN_EVIDENCE_CHUNKS);
export const manualSelectionMinMargin = Number(env.MANUAL_SELECTION_MIN_MARGIN);
