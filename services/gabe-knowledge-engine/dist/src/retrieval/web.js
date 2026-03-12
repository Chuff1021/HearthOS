"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchWebHints = searchWebHints;
const config_1 = require("../config");
async function searchWebHints(question) {
    const key = config_1.env.TAVILY_API_KEY;
    if (!key)
        return { terms: [], results: [] };
    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: key,
                query: question,
                search_depth: "basic",
                max_results: 5,
                include_answer: false,
                include_raw_content: false,
            }),
        });
        if (!res.ok)
            return { terms: [], results: [] };
        const data = await res.json();
        const results = Array.isArray(data?.results)
            ? data.results.map((r) => ({
                title: String(r?.title || ""),
                url: String(r?.url || ""),
                snippet: String(r?.content || "").slice(0, 500),
            })).filter((r) => !!r.url)
            : [];
        const top = results[0];
        const terms = extractTermsFromResults(results);
        return { terms, top, results };
    }
    catch {
        return { terms: [], results: [] };
    }
}
function extractTermsFromResults(results) {
    const text = results.map((r) => `${r.title} ${r.snippet}`).join(" ").toLowerCase();
    const tokens = text
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .filter((t) => t.length >= 3)
        .filter((t) => !STOP.has(t));
    const freq = new Map();
    for (const t of tokens)
        freq.set(t, (freq.get(t) || 0) + 1);
    return Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([t]) => t);
}
const STOP = new Set([
    "the", "and", "for", "with", "that", "this", "from", "have", "will", "your", "you", "into", "about",
    "manual", "fireplace", "stove", "insert", "model", "installation", "owner", "service", "guide"
]);
