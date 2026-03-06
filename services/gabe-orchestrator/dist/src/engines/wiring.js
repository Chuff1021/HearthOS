"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWiringEngine = runWiringEngine;
const shared_1 = require("./shared");
async function runWiringEngine(baseUrl, question) {
    return (0, shared_1.queryRetrievalBackend)(baseUrl, question);
}
