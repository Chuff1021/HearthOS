import { z } from "zod";
import { RetrievedChunk, GabeAnswer } from "../types";

const manualSchema = z.object({
  answer: z.string(),
  source_type: z.literal("manual"),
  manual_title: z.string(),
  page_number: z.number(),
  source_url: z.string().url(),
  confidence: z.number().min(0).max(100)
});

const webSchema = z.object({
  answer: z.string(),
  source_type: z.literal("web"),
  url: z.string().url(),
  section: z.string(),
  confidence: z.number().min(0).max(100)
});

const noneSchema = z.object({
  answer: z.literal("This information is not available in verified manufacturer documentation."),
  source_type: z.literal("none"),
  confidence: z.literal(0)
});

type ManualAnswer = z.infer<typeof manualSchema>;
type WebAnswer = z.infer<typeof webSchema>;

type NoneAnswer = z.infer<typeof noneSchema>;

type Parsed = ManualAnswer | WebAnswer | NoneAnswer;

export function validateAnswer(answer: GabeAnswer, chunks: RetrievedChunk[]) {
  const parsed = manualSchema.safeParse(answer);
  if (parsed.success) {
    const a = parsed.data;
    const match = chunks.find((c) =>
      c.source_type === "manual" &&
      c.manual_title === a.manual_title &&
      c.page_number === a.page_number &&
      c.source_url === a.source_url
    );
    if (!match) {
      throw new Error("Manual citation does not match retrieved chunks");
    }
    return;
  }

  const parsedWeb = webSchema.safeParse(answer);
  if (parsedWeb.success) {
    const a = parsedWeb.data;
    const match = chunks.find((c) =>
      c.source_type === "web" &&
      c.source_url === a.url
    );
    if (!match) {
      throw new Error("Web citation does not match retrieved chunks");
    }
    return;
  }

  if (noneSchema.safeParse(answer).success) return;

  throw new Error("Answer does not match any allowed schema");
}
