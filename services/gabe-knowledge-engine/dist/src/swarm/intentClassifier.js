"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyIntent = classifyIntent;
function classifyIntent(question) {
    const q = question.toLowerCase();
    if (/mantel|clearance|distance to wall|rear wall/.test(q))
        return { intent: "clearances", component: q.includes("mantel") ? "mantel" : undefined };
    if (/framing|rough opening|width|height|depth/.test(q))
        return { intent: "framing" };
    if (/vent|chimney|horizontal|vertical|run/.test(q))
        return { intent: "venting" };
    if (/manifold|inlet pressure|wc\b|gas pressure/.test(q))
        return { intent: "gas pressure" };
    if (/wiring|voltage|transformer|module|switch/.test(q))
        return { intent: "electrical" };
    if (/won't light|wont light|pilot|error|not working|troubleshoot/.test(q))
        return { intent: "troubleshooting" };
    if (/remote|receiver|thermostat app|wifi/.test(q))
        return { intent: "remote operation" };
    if (/part number|replacement|replace|assembly|exploded/.test(q))
        return { intent: "replacement parts" };
    if (/install|installation|step by step/.test(q))
        return { intent: "installation steps" };
    return { intent: "code compliance" };
}
