"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.manualSelectionMinMargin = exports.minEvidenceChunks = exports.similarityThreshold = exports.allowlistDomains = exports.env = void 0;
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    PORT: zod_1.z.string().default("4100"),
    GROQ_API_KEY: zod_1.z.string().optional().default(""),
    GROQ_MODEL: zod_1.z.string().default("llama-3.1-8b-instant"),
    QDRANT_URL: zod_1.z.string().url(),
    QDRANT_API_KEY: zod_1.z.string().optional(),
    QDRANT_COLLECTION: zod_1.z.string().default("fireplace_manuals"),
    QDRANT_DIAGRAM_COLLECTION: zod_1.z.string().default("fireplace_diagrams"),
    EMBEDDINGS_PROVIDER: zod_1.z.enum(["transformers", "openai", "jina"]).default("transformers"),
    OPENAI_API_KEY: zod_1.z.string().optional(),
    JINA_API_KEY: zod_1.z.string().optional(),
    BRAVE_API_KEY: zod_1.z.string().optional(),
    TAVILY_API_KEY: zod_1.z.string().optional(),
    ALLOWLIST_DOMAINS: zod_1.z.string().default([
        "kozyheat.com",
        "travisindustries.com",
        "majesticproducts.com",
        "napoleon.com",
        "hearthnhome.com",
        "empirecomfort.com",
        "ihp.us.com",
        "fire-parts.com",
        "energypartsplus.com"
    ].join(",")),
    SIMILARITY_THRESHOLD: zod_1.z.string().default("0.78"),
    MIN_EVIDENCE_CHUNKS: zod_1.z.string().default("1"),
    MANUAL_SELECTION_MIN_MARGIN: zod_1.z.string().default("0.01"),
    MANUALS_PATH: zod_1.z.string().default("/var/lib/gabe/manuals"),
    LOG_LEVEL: zod_1.z.string().default("info")
});
exports.env = envSchema.parse({
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
    LOG_LEVEL: process.env.LOG_LEVEL
});
exports.allowlistDomains = exports.env.ALLOWLIST_DOMAINS.split(",").map((d) => d.trim()).filter(Boolean);
exports.similarityThreshold = Number(exports.env.SIMILARITY_THRESHOLD);
exports.minEvidenceChunks = Number(exports.env.MIN_EVIDENCE_CHUNKS);
exports.manualSelectionMinMargin = Number(exports.env.MANUAL_SELECTION_MIN_MARGIN);
