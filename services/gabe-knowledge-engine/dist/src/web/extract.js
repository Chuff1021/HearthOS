"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPageText = fetchPageText;
exports.chunkWebText = chunkWebText;
const undici_1 = require("undici");
const cheerio_1 = require("cheerio");
async function fetchPageText(url) {
    const res = await (0, undici_1.fetch)(url);
    if (!res.ok)
        throw new Error(`Fetch failed: ${res.status}`);
    const html = await res.text();
    const $ = (0, cheerio_1.load)(html);
    $("script,style,noscript").remove();
    const title = $("h1").first().text().trim() || $("title").text().trim();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    return { title, text };
}
function chunkWebText(text, chunkSize = 800, overlap = 100) {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
        const chunk = words.slice(i, i + chunkSize).join(" ");
        if (chunk)
            chunks.push(chunk);
    }
    return chunks;
}
