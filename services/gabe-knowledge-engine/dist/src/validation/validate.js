"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAnswer = validateAnswer;
const zod_1 = require("zod");
const certaintySchema = zod_1.z.enum(["Verified Exact", "Verified Partial", "Interpreted", "Unverified"]);
const manualSchema = zod_1.z.object({
    answer: zod_1.z.string(),
    source_type: zod_1.z.literal("manual"),
    manual_title: zod_1.z.string(),
    page_number: zod_1.z.number(),
    source_url: zod_1.z.string().url(),
    quote: zod_1.z.string().min(1),
    confidence: zod_1.z.number().min(0).max(100),
    certainty: certaintySchema,
    validator_notes: zod_1.z.array(zod_1.z.string()).optional(),
    run_outcome: zod_1.z.string().optional(),
});
const webSchema = zod_1.z.object({
    answer: zod_1.z.string(),
    source_type: zod_1.z.literal("web"),
    url: zod_1.z.string().url(),
    section: zod_1.z.string(),
    quote: zod_1.z.string().min(1),
    confidence: zod_1.z.number().min(0).max(100),
    certainty: certaintySchema,
    validator_notes: zod_1.z.array(zod_1.z.string()).optional(),
    run_outcome: zod_1.z.string().optional(),
});
const noneSchema = zod_1.z.object({
    answer: zod_1.z.literal("This information is not available in verified manufacturer documentation."),
    source_type: zod_1.z.literal("none"),
    confidence: zod_1.z.literal(0),
    certainty: zod_1.z.literal("Unverified"),
    validator_notes: zod_1.z.array(zod_1.z.string()).optional(),
    run_outcome: zod_1.z.string().optional(),
});
function validateAnswer(answer, chunks) {
    const parsed = manualSchema.safeParse(answer);
    if (parsed.success) {
        const a = parsed.data;
        const match = chunks.find((c) => c.source_type === "manual" &&
            c.manual_title === a.manual_title &&
            c.page_number === a.page_number &&
            c.source_url === a.source_url);
        if (!match) {
            throw new Error("Manual citation does not match retrieved chunks");
        }
        if (!quoteInChunk(a.quote, match.chunk_text)) {
            throw new Error("Manual quote not found in retrieved chunk");
        }
        return;
    }
    const webParsed = webSchema.safeParse(answer);
    if (webParsed.success) {
        const a = webParsed.data;
        if (!a.url || !a.quote)
            throw new Error("Web answer missing URL or quote");
        return;
    }
    if (noneSchema.safeParse(answer).success)
        return;
    throw new Error("Answer does not match any allowed schema");
}
function quoteInChunk(quote, chunkText) {
    const words = quote.trim().split(/\s+/);
    if (words.length > 25)
        return false;
    return chunkText.toLowerCase().includes(quote.trim().toLowerCase());
}
