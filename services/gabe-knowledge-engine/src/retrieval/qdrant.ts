import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../config";

export const qdrant = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY
});

const ready = new Set<string>();

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureCollection(vectorSize: number, collection = env.QDRANT_COLLECTION) {
  if (ready.has(collection)) return;
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const exists = await qdrant.getCollections();
      const found = exists.collections?.some((c) => c.name === collection);
      if (!found) {
        await qdrant.createCollection(collection, {
          vectors: { size: vectorSize, distance: "Cosine" }
        });
      }
      // Ensure full-text index for keyword search
      try {
        await qdrant.createPayloadIndex(collection, {
          field_name: "chunk_text",
          field_schema: "text"
        });
      } catch {}
      ready.add(collection);
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = 1000 * attempt;
      console.warn(`Qdrant collection check failed (attempt ${attempt}). Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}
