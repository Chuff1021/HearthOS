"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPartsEngine = runPartsEngine;
const shared_1 = require("./shared");
async function runPartsEngine(baseUrl, question) {
    return (0, shared_1.queryRetrievalBackend)(baseUrl, question);
}
