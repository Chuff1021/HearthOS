"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.braveSearch = braveSearch;
const config_1 = require("../config");
const undici_1 = require("undici");
async function braveSearch(query, count = 5) {
    if (!config_1.env.BRAVE_API_KEY)
        throw new Error("BRAVE_API_KEY not set");
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));
    url.searchParams.set("source", "web");
    const res = await (0, undici_1.fetch)(url.toString(), {
        headers: {
            "Accept": "application/json",
            "X-Subscription-Token": config_1.env.BRAVE_API_KEY
        }
    });
    if (!res.ok)
        throw new Error(`Brave search failed: ${res.status}`);
    const data = await res.json();
    const results = (data.web?.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description
    }));
    return results.filter((r) => config_1.allowlistDomains.some((d) => r.url.includes(d)));
}
