import fs from "fs";

const FILE = "/var/lib/hearthos-data/gabe/self-refiner.log";

export function logRefinementEvent(event: {
  question: string;
  intent: string;
  model?: string;
  failure: string;
  action: string;
}) {
  try {
    fs.mkdirSync("/var/lib/hearthos-data/gabe", { recursive: true });
    fs.appendFileSync(FILE, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
  } catch {
    // non-fatal
  }
}
