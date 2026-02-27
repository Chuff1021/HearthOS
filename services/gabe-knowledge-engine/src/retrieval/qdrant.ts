import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../config";

export const qdrant = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY
});

export async function ensureCollection(vectorSize: number) {
  const collection = env.QDRANT_COLLECTION;
  const exists = await qdrant.getCollections();
  const found = exists.collections?.some((c) => c.name === collection);
  if (found) return;

  await qdrant.createCollection(collection, {
    vectors: {
      size: vectorSize,
      distance: "Cosine"
    }
  });
}
