"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PART_ALIASES = void 0;
exports.expandPartTerms = expandPartTerms;
exports.PART_ALIASES = {
    thermopile: ['thermopile', 'pilot generator', 'millivolt generator'],
    thermocouple: ['thermocouple', 'pilot sensor'],
    control_module: ['control module', 'module board', 'receiver module'],
    gas_valve: ['gas valve', 'valve assembly'],
    igniter: ['igniter', 'spark igniter', 'electrode'],
};
function expandPartTerms(question) {
    const q = question.toLowerCase();
    const out = new Set();
    Object.entries(exports.PART_ALIASES).forEach(([k, aliases]) => {
        if (aliases.some((a) => q.includes(a))) {
            out.add(k);
            aliases.forEach((a) => out.add(a));
        }
    });
    return Array.from(out);
}
