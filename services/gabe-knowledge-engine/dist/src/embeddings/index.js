"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.embed = embed;
const config_1 = require("../config");
const undici_1 = require("undici");
let transformerPipeline;
async function embedWithTransformers(texts) {
    if (!transformerPipeline) {
        const { pipeline } = await Promise.resolve().then(() => __importStar(require("@xenova/transformers")));
        transformerPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    const embeddings = [];
    for (const text of texts) {
        const output = await transformerPipeline(text, { pooling: "mean", normalize: true });
        embeddings.push(Array.from(output.data));
    }
    return embeddings;
}
async function embedWithOpenAI(texts) {
    if (!config_1.env.OPENAI_API_KEY)
        throw new Error("OPENAI_API_KEY not set");
    const res = await (0, undici_1.fetch)("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${config_1.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "text-embedding-3-small",
            input: texts
        })
    });
    if (!res.ok)
        throw new Error(`OpenAI embeddings failed: ${res.status}`);
    const data = await res.json();
    return data.data.map((d) => d.embedding);
}
async function embedWithJina(texts) {
    if (!config_1.env.JINA_API_KEY)
        throw new Error("JINA_API_KEY not set");
    const res = await (0, undici_1.fetch)("https://api.jina.ai/v1/embeddings", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${config_1.env.JINA_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "jina-embeddings-v2-base-en",
            input: texts
        })
    });
    if (!res.ok)
        throw new Error(`Jina embeddings failed: ${res.status}`);
    const data = await res.json();
    return data.data.map((d) => d.embedding);
}
async function embed(texts) {
    switch (config_1.env.EMBEDDINGS_PROVIDER) {
        case "openai":
            return embedWithOpenAI(texts);
        case "jina":
            return embedWithJina(texts);
        default:
            return embedWithTransformers(texts);
    }
}
