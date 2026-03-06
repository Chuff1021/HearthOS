"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugModeEnabled = exports.env = void 0;
exports.env = {
    PORT: process.env.PORT ?? "4200",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
    ENGINE_BUILD_ID: process.env.ENGINE_BUILD_ID ?? "dev",
    ENGINE_COMMIT_SHA: process.env.ENGINE_COMMIT_SHA ?? "local",
    ENGINE_RUNTIME_NAME: process.env.ENGINE_RUNTIME_NAME ?? "gabe-orchestrator",
    GABE_RETRIEVAL_URL: process.env.GABE_RETRIEVAL_URL ?? "http://127.0.0.1:4100",
    GABE_DEBUG_MODE: process.env.GABE_DEBUG_MODE ?? "true",
};
exports.debugModeEnabled = exports.env.GABE_DEBUG_MODE === "true";
