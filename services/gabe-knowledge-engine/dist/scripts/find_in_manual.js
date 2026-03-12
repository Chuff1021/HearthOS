"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pdf_1 = require("../src/ingest/pdf");
const args = process.argv.slice(2);
const [filePath, pattern] = args;
if (!filePath || !pattern) {
    console.error("Usage: find_in_manual <filePath> <pattern>");
    process.exit(1);
}
const regex = new RegExp(pattern, "i");
async function run() {
    const pages = await (0, pdf_1.extractPdfPages)(filePath);
    let matches = 0;
    for (const page of pages) {
        if (regex.test(page.text)) {
            matches += 1;
            const preview = page.text.replace(/\s+/g, " ").slice(0, 300);
            console.log(`PAGE ${page.page}: ${preview}`);
        }
    }
    if (matches === 0) {
        console.log("No matches found.");
    }
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
