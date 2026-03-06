"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGeneralRetrievalEngine = runGeneralRetrievalEngine;
const shared_1 = require("./shared");
async function runGeneralRetrievalEngine(baseUrl, question) {
    return (0, shared_1.queryRetrievalBackend)(baseUrl, question);
}
