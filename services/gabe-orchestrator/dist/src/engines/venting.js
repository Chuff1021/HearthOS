"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runVentingEngine = runVentingEngine;
const shared_1 = require("./shared");
async function runVentingEngine(baseUrl, question) {
    return (0, shared_1.queryRetrievalBackend)(baseUrl, question);
}
