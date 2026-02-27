import { env } from "../config";
import { fetch } from "undici";

let transformerPipeline: any;

async function embedWithTransformers(texts: string[]) {
  if (!transformerPipeline) {
    const { pipeline } = await import("@xenova/transformers");
    transformerPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  const embeddings = [];
  for (const text of texts) {
    const output = await transformerPipeline(text, { pooling: "mean", normalize: true });
    embeddings.push(Array.from(output.data as Float32Array));
  }
  return embeddings;
}

async function embedWithOpenAI(texts: string[]) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts
    })
  });
  if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`);
  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}

async function embedWithJina(texts: string[]) {
  if (!env.JINA_API_KEY) throw new Error("JINA_API_KEY not set");
  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.JINA_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "jina-embeddings-v2-base-en",
      input: texts
    })
  });
  if (!res.ok) throw new Error(`Jina embeddings failed: ${res.status}`);
  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}

export async function embed(texts: string[]): Promise<number[][]> {
  switch (env.EMBEDDINGS_PROVIDER) {
    case "openai":
      return embedWithOpenAI(texts);
    case "jina":
      return embedWithJina(texts);
    default:
      return embedWithTransformers(texts);
  }
}
