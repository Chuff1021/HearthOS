import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("4100"),
  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL: z.string().default("llama-3.1-8b-instant"),
  QDRANT_URL: z.string().url(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_MANUAL_COLLECTION: z.string().default("fireplace_manual_chunks"),
  QDRANT_QA_MEMORY_COLLECTION: z.string().default("fireplace_qa_memory"),
  QDRANT_VENT_RULES_COLLECTION: z.string().default("fireplace_vent_rules"),
  QDRANT_WIRING_GRAPHS_COLLECTION: z.string().default("fireplace_wiring_graphs"),
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
  MANUALS_PATH: z.string().default("/var/lib/gabe/manuals"),
  LOG_LEVEL: z.string().default("info")
});

export const env = envSchema.parse({
  PORT: process.env.PORT,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL,
  QDRANT_URL: process.env.QDRANT_URL,
  QDRANT_API_KEY: process.env.QDRANT_API_KEY,
  QDRANT_MANUAL_COLLECTION: process.env.QDRANT_MANUAL_COLLECTION,
  QDRANT_QA_MEMORY_COLLECTION: process.env.QDRANT_QA_MEMORY_COLLECTION,
  QDRANT_VENT_RULES_COLLECTION: process.env.QDRANT_VENT_RULES_COLLECTION,
  QDRANT_WIRING_GRAPHS_COLLECTION: process.env.QDRANT_WIRING_GRAPHS_COLLECTION,
  EMBEDDINGS_PROVIDER: process.env.EMBEDDINGS_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  JINA_API_KEY: process.env.JINA_API_KEY,
  BRAVE_API_KEY: process.env.BRAVE_API_KEY,
  ALLOWLIST_DOMAINS: process.env.ALLOWLIST_DOMAINS,
  SIMILARITY_THRESHOLD: process.env.SIMILARITY_THRESHOLD,
  MANUALS_PATH: process.env.MANUALS_PATH,
  LOG_LEVEL: process.env.LOG_LEVEL
});

export const allowlistDomains = env.ALLOWLIST_DOMAINS.split(",").map((d) => d.trim()).filter(Boolean);
export const similarityThreshold = Number(env.SIMILARITY_THRESHOLD);
export const qdrantCollections = {
  manualChunks: env.QDRANT_MANUAL_COLLECTION,
  qaMemory: env.QDRANT_QA_MEMORY_COLLECTION,
  ventRules: env.QDRANT_VENT_RULES_COLLECTION,
  wiringGraphs: env.QDRANT_WIRING_GRAPHS_COLLECTION,
} as const;
