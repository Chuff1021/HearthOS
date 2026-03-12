"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGroq = callGroq;
const config_1 = require("../config");
const undici_1 = require("undici");
function buildSystemPrompt(chunks) {
    return `You are GABE (Gas Appliance & Burner Expert), a certified master fireplace technician.

Rules:
- Only answer using the provided context chunks.
- Never guess or infer beyond context.
- If the answer is not in context, respond exactly:
"This information is not available in verified manufacturer documentation."
- Output JSON only. No extra text.
- Output source_type = "manual" with manual_title, page_number, source_url when evidence exists.
- If evidence is insufficient, output source_type = "none".
- Include a short verbatim quote (max 25 words) from one chunk that directly supports the answer as "quote".
- Use exactly one chunk to answer. Do not combine multiple chunks.
- Include confidence score 0-100.
- Include certainty as one of: "Verified Exact", "Verified Partial", "Interpreted", "Unverified".`;
}
function buildContext(chunks) {
    return chunks.map((c, idx) => {
        const header = c.source_type === "manual"
            ? `Chunk ${idx + 1} (manual) | ${c.manual_title} | p.${c.page_number} | ${c.section_title || "Section"} | ${c.source_url}`
            : `Chunk ${idx + 1} (web) | ${c.section || "Section"} | ${c.source_url}`;
        return `${header}\n${c.chunk_text}`;
    }).join("\n\n");
}
async function callGroq(chunks, question) {
    const res = await (0, undici_1.fetch)("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${config_1.env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: config_1.env.GROQ_MODEL,
            messages: [
                { role: "system", content: buildSystemPrompt(chunks) },
                { role: "user", content: `Context:\n${buildContext(chunks)}\n\nQuestion: ${question}` }
            ],
            temperature: 0.1,
            top_p: 0.9,
            max_tokens: 500,
            frequency_penalty: 0,
            presence_penalty: 0,
            response_format: { type: "json_object" }
        })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Groq error: ${err}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content)
        throw new Error("Missing Groq content");
    const parsed = JSON.parse(content);
    if (!parsed?.certainty) {
        const c = Number(parsed?.confidence || 0);
        parsed.certainty = c >= 85 ? "Verified Exact" : c >= 65 ? "Verified Partial" : c >= 40 ? "Interpreted" : "Unverified";
    }
    if (!Array.isArray(parsed?.validator_notes))
        parsed.validator_notes = [];
    return parsed;
}
