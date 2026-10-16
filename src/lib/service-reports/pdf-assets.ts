import { readFileSync } from "node:fs";
import path from "node:path";

// Turbopack rewrites package resolution to a module ID, not a file path.
// These font files are explicitly included in next.config.ts's function trace.
export function serviceReportFont(face: "Regular" | "SemiBold"): Buffer {
  return readFileSync(path.join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", `Geist-${face}.ttf`));
}
