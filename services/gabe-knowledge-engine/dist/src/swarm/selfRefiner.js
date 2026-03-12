"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logRefinementEvent = logRefinementEvent;
const fs_1 = __importDefault(require("fs"));
const FILE = "/var/lib/hearthos-data/gabe/self-refiner.log";
function logRefinementEvent(event) {
    try {
        fs_1.default.mkdirSync("/var/lib/hearthos-data/gabe", { recursive: true });
        fs_1.default.appendFileSync(FILE, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
    }
    catch {
        // non-fatal
    }
}
