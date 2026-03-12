"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const undici_1 = require("undici");
const question = "Can the Kozy Heat Carlton 46 use 4x6 vent pipe?";
const base = process.env.GABE_ENGINE_URL || "http://localhost:4100";
const url = base.endsWith("/query") ? base : `${base.replace(/\/$/, "")}/query`;
async function run() {
    const res = await (0, undici_1.fetch)(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
