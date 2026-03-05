import fs from "fs";

const FILE = "/var/lib/hearthos-data/gabe/run-metadata.jsonl";

export function appendRunMetadata(payload: Record<string, unknown>) {
  try {
    fs.mkdirSync("/var/lib/hearthos-data/gabe", { recursive: true });
    fs.appendFileSync(FILE, JSON.stringify({ ts: new Date().toISOString(), ...payload }) + "\n");
  } catch {
    // non-fatal
  }
}
