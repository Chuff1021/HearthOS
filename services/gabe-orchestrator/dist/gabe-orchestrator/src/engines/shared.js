"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryRetrievalBackend = queryRetrievalBackend;
async function queryRetrievalBackend(baseUrl, question) {
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
        return response.json();
    }
    catch {
        return {
            answer: "This information is not available in verified manufacturer documentation.",
            source_type: "none",
            confidence: 0,
        };
    }
}
