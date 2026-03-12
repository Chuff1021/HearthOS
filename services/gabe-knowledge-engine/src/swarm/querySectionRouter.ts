import { IntentCategory } from "./intentClassifier";

export function preferredSectionsForIntent(intent: IntentCategory, question: string): string[] {
  const q = question.toLowerCase();
  if (intent === "venting") return ["venting", "chimney_pipe", "gas_specs"];
  if (intent === "framing") return ["framing", "clearances"];
  if (intent === "clearances") {
    if (q.includes("mantel")) return ["mantel_clearances", "clearances"];
    if (q.includes("wall")) return ["wall_clearances", "clearances"];
    return ["clearances", "mantel_clearances", "wall_clearances"];
  }
  if (intent === "electrical") return ["wiring", "electrical", "troubleshooting"];
  if (intent === "replacement parts") return ["parts", "maintenance", "troubleshooting"];
  if (intent === "gas pressure") return ["gas_specs", "installation"];
  if (intent === "troubleshooting") return ["troubleshooting", "operation"];
  if (intent === "remote operation") return ["operation", "troubleshooting"];
  if (intent === "installation steps") return ["framing", "clearances", "venting", "gas_specs"];
  return ["operation", "maintenance", "troubleshooting"];
}
