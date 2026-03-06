"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryRetrievalBackend = queryRetrievalBackend;
async function queryRetrievalBackend(baseUrl, question) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
    });
    if (!response.ok) {
        throw new Error(`Retrieval backend query failed with ${response.status}`);
    }
    return response.json();
}
