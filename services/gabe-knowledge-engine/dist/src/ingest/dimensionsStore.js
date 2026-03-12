"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDimensionStoragePath = getDimensionStoragePath;
exports.upsertDimensions = upsertDimensions;
exports.queryDimensionsByModelTopic = queryDimensionsByModelTopic;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const config_1 = require("../config");
const STORAGE_ROOT = (0, node_path_1.join)(config_1.env.MANUALS_PATH, "dimensions");
function slugify(value) {
    return value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "unknown";
}
function keyFor(record) {
    return [
        record.install_angle,
        record.dimension_key,
        record.value_imperial,
        record.value_metric,
        record.units,
        record.page_number,
        record.source_url,
        record.manual_title,
        record.manufacturer,
        record.model
    ].join("|");
}
function normalizeInstallAngle(value) {
    if (value === "45")
        return "45";
    if (value === "standard")
        return "standard";
    return "unknown";
}
function normalizeFloatString(value, decimals) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return value;
    return parsed.toFixed(decimals);
}
function normalizeRecord(record) {
    const confidence = Number.isFinite(record.confidence)
        ? Math.max(0, Math.min(1, record.confidence))
        : 0;
    return {
        install_angle: normalizeInstallAngle(record.install_angle),
        dimension_key: record.dimension_key.trim().toLowerCase(),
        value_imperial: normalizeFloatString(record.value_imperial, 3),
        value_metric: normalizeFloatString(record.value_metric, 2),
        units: record.units.trim().toLowerCase(),
        page_number: Math.max(1, Math.trunc(record.page_number)),
        source_url: record.source_url.trim(),
        manual_title: record.manual_title.trim(),
        manufacturer: record.manufacturer.trim(),
        model: record.model.trim(),
        confidence: Number(confidence.toFixed(4))
    };
}
function getDimensionStoragePath(manufacturer, model) {
    const mfg = slugify(manufacturer);
    const mdl = slugify(model);
    return (0, node_path_1.join)(STORAGE_ROOT, mfg, `${mdl}.json`);
}
async function readExisting(path) {
    try {
        const raw = await (0, promises_1.readFile)(path, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
async function upsertDimensions(records) {
    if (records.length === 0)
        return { ok: true, upserted: 0 };
    const normalized = records.map(normalizeRecord);
    const groups = new Map();
    for (const r of normalized) {
        const path = getDimensionStoragePath(r.manufacturer, r.model);
        const arr = groups.get(path) ?? [];
        arr.push(r);
        groups.set(path, arr);
    }
    let upserted = 0;
    for (const [path, incoming] of groups.entries()) {
        const existing = await readExisting(path);
        const byKey = new Map();
        for (const e of existing.map(normalizeRecord))
            byKey.set(keyFor(e), e);
        for (const n of incoming) {
            const k = keyFor(n);
            const prev = byKey.get(k);
            if (!prev || n.confidence > prev.confidence) {
                byKey.set(k, n);
            }
        }
        const merged = Array.from(byKey.values()).sort((a, b) => {
            return (a.dimension_key.localeCompare(b.dimension_key) ||
                a.install_angle.localeCompare(b.install_angle) ||
                a.page_number - b.page_number ||
                a.value_metric.localeCompare(b.value_metric));
        });
        await (0, promises_1.mkdir)((0, node_path_1.dirname)(path), { recursive: true });
        await (0, promises_1.writeFile)(path, JSON.stringify(merged, null, 2), "utf8");
        upserted += incoming.length;
    }
    return { ok: true, upserted };
}
async function queryDimensionsByModelTopic(input) {
    let files = [];
    if (input.manufacturer) {
        files = [getDimensionStoragePath(input.manufacturer, input.model)];
    }
    else {
        try {
            const all = await (0, promises_1.readdir)(STORAGE_ROOT, { recursive: true });
            files = all.filter((f) => typeof f === "string" && f.endsWith(`/${slugify(input.model)}.json`)).map((f) => (0, node_path_1.join)(STORAGE_ROOT, f));
        }
        catch {
            files = [];
        }
    }
    const allRecords = [];
    for (const file of files) {
        const recs = await readExisting(file);
        allRecords.push(...recs);
    }
    if (allRecords.length === 0)
        return [];
    const topicTokens = input.topic
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 2);
    return allRecords
        .map(normalizeRecord)
        .filter((r) => {
        if (input.install_angle && r.install_angle !== input.install_angle)
            return false;
        if (input.manufacturer && r.manufacturer.toLowerCase() !== input.manufacturer.toLowerCase())
            return false;
        if (r.model.toLowerCase() !== input.model.toLowerCase())
            return false;
        if (topicTokens.length === 0)
            return true;
        return topicTokens.some((t) => r.dimension_key.includes(t));
    })
        .sort((a, b) => {
        return (a.page_number - b.page_number ||
            a.dimension_key.localeCompare(b.dimension_key) ||
            b.confidence - a.confidence);
    });
}
