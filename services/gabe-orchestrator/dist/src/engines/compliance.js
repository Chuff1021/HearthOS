"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runComplianceEngine = runComplianceEngine;
const shared_1 = require("./shared");
async function runComplianceEngine(baseUrl, question) {
    return (0, shared_1.queryRetrievalBackend)(baseUrl, question);
}
