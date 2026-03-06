import { z } from "zod";
import { RetrievedChunk, GabeAnswer } from "../types";

const certaintySchema = z.enum(["Verified Exact", "Verified Partial", "Interpreted", "Unverified"]);

const manualSchema = z.object({
  answer: z.string(),
  source_type: z.literal("manual"),
  manual_title: z.string(),
  page_number: z.number(),
  source_url: z.string().url(),
  quote: z.string().min(1),
  confidence: z.number().min(0).max(100),
  certainty: certaintySchema,
  validator_notes: z.array(z.string()).optional(),
  run_outcome: z.string().optional(),
});

const webSchema = z.object({
  answer: z.string(),
  source_type: z.literal("web"),
  url: z.string().url(),
  section: z.string(),
  quote: z.string().min(1),
  confidence: z.number().min(0).max(100),
  certainty: certaintySchema,
  validator_notes: z.array(z.string()).optional(),
  run_outcome: z.string().optional(),
});

const noneSchema = z.object({
  answer: z.literal("This information is not available in verified manufacturer documentation."),
  source_type: z.literal("none"),
  confidence: z.literal(0),
  certainty: z.literal("Unverified"),
  validator_notes: z.array(z.string()).optional(),
  run_outcome: z.string().optional(),
});

type ManualAnswer = z.infer<typeof manualSchema>;

export function validateAnswer(answer: GabeAnswer, chunks: RetrievedChunk[]) {
  const parsed = manualSchema.safeParse(answer);
  if (parsed.success) {
    const a: ManualAnswer = parsed.data;
    const match = chunks.find((c) =>
      c.source_type === "manual" &&
      c.manual_title === a.manual_title &&
      c.page_number === a.page_number &&
      c.source_url === a.source_url
    );
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
    if (!a.url || !a.quote) throw new Error("Web answer missing URL or quote");
    return;
  }

  if (noneSchema.safeParse(answer).success) return;

  throw new Error("Answer does not match any allowed schema");
}

function quoteInChunk(quote: string, chunkText: string) {
  const words = quote.trim().split(/\s+/);
  if (words.length > 25) return false;
  return chunkText.toLowerCase().includes(quote.trim().toLowerCase());
}
