"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const qdrant_1 = require("../src/retrieval/qdrant");
const config_1 = require("../src/config");
const promises_1 = require("node:fs/promises");
function slug(v) { return (v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
async function main() {
    const res = await qdrant_1.qdrant.scroll(config_1.env.QDRANT_COLLECTION, {
        limit: 10000,
        with_payload: true,
        with_vector: false,
    });
    const points = res.points || [];
    const grouped = new Map();
    for (const p of points) {
        const x = p.payload || {};
        const key = `${x.manufacturer || ""}|${x.model || ""}|${x.manual_title || ""}|${x.source_url || ""}`;
        const arr = grouped.get(key) || [];
        arr.push(x);
        grouped.set(key, arr);
    }
    const out = [];
    for (const [_, arr] of grouped.entries()) {
        const x = arr[0] || {};
        const pageMax = arr.reduce((m, r) => Math.max(m, Number(r.page_number || 0)), 0);
        const manufacturer = String(x.manufacturer || "unknown");
        const model = String(x.model || "unknown");
        const title = String(x.manual_title || "unknown manual");
        const source = String(x.source_url || "");
        out.push({
            manual_id: slug(`${manufacturer}-${model}-${title}`),
            manufacturer_canonical: manufacturer.toLowerCase(),
            manufacturer_display: manufacturer,
            model_canonical: model.toLowerCase(),
            model_display: model,
            manual_title: title,
            manual_type: String(x.doc_type || "other"),
            source_url: source,
            page_count_estimate: pageMax,
            metadata_confidence: source && model !== "unknown" ? 0.8 : 0.45,
        });
    }
    await (0, promises_1.writeFile)("/tmp/gabe_manual_registry_backfill.json", JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ ok: true, manuals: out.length, outPath: "/tmp/gabe_manual_registry_backfill.json" }));
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
