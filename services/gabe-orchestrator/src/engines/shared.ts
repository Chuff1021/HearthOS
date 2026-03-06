import type { GabeAnswer } from "../../../gabe-validator/src";

export async function queryRetrievalBackend(baseUrl: string, question: string): Promise<GabeAnswer> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      return {
        answer: "This information is not available in verified manufacturer documentation.",
        source_type: "none",
        confidence: 0,
      };
    }

    return response.json() as Promise<GabeAnswer>;
  } catch {
    return {
      answer: "This information is not available in verified manufacturer documentation.",
      source_type: "none",
      confidence: 0,
    };
  }
}
