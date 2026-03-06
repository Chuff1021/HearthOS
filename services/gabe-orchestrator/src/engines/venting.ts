import type { GabeAnswer } from "../../../gabe-validator/src";
import { queryRetrievalBackend } from "./shared";

export async function runVentingEngine(baseUrl: string, question: string): Promise<GabeAnswer> {
  return queryRetrievalBackend(baseUrl, question);
}
