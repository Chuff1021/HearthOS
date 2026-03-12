"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qdrant = void 0;
exports.ensureCollection = ensureCollection;
const js_client_rest_1 = require("@qdrant/js-client-rest");
const config_1 = require("../config");
exports.qdrant = new js_client_rest_1.QdrantClient({
    url: config_1.env.QDRANT_URL,
    apiKey: config_1.env.QDRANT_API_KEY
});
const ready = new Set();
async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function ensureCollection(vectorSize, collection = config_1.env.QDRANT_COLLECTION) {
    if (ready.has(collection))
        return;
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            const exists = await exports.qdrant.getCollections();
            const found = exists.collections?.some((c) => c.name === collection);
            if (!found) {
                await exports.qdrant.createCollection(collection, {
                    vectors: { size: vectorSize, distance: "Cosine" }
                });
            }
            // Ensure full-text index for keyword search
            try {
                await exports.qdrant.createPayloadIndex(collection, {
                    field_name: "chunk_text",
                    field_schema: "text"
                });
            }
            catch { }
            ready.add(collection);
            return;
        }
        catch (err) {
            if (attempt === maxRetries)
                throw err;
            const delay = 1000 * attempt;
            console.warn(`Qdrant collection check failed (attempt ${attempt}). Retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }
}
