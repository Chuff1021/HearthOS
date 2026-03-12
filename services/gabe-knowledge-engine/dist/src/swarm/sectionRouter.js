"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeBySection = routeBySection;
const sectionHints = {
    "clearances": ["clearance", "mantel", "sidewall", "hearth"],
    "framing": ["framing", "rough opening", "dimensions", "width", "height", "depth"],
    "venting": ["vent", "chimney", "termination", "vent table", "vent chart", "pipe size", "horizontal", "vertical"],
    "gas pressure": ["gas", "pressure", "manifold", "inlet", "wc"],
    "electrical": ["wiring", "electrical", "switch", "module", "transformer", "voltage"],
    "troubleshooting": ["troubleshooting", "problem", "diagnostic", "pilot", "ignition", "error"],
    "remote operation": ["remote", "receiver", "thermostat", "pairing", "sync"],
    "replacement parts": ["parts", "part", "exploded", "diagram", "part number", "assembly"],
    "installation steps": ["installation", "install", "step", "sequence"],
    "code compliance": ["code", "compliance", "approved", "listing", "permit", "inspection"],
};
function routeBySection(intent, chunks) {
    const hints = sectionHints[intent] || [];
    if (!hints.length)
        return chunks;
    const filtered = chunks.filter((c) => {
        const hay = `${c.section_title || ""} ${c.chunk_text || ""} ${c.doc_type || ""}`.toLowerCase();
        return hints.some((h) => hay.includes(h));
    });
    return filtered.length > 0 ? filtered : chunks;
}
