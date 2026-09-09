export const JOB_TYPE_OPTIONS = [
  { value: "service", label: "Gas Service" },
  { value: "wood-service", label: "Wood Fireplace Service" },
  { value: "pellet-service", label: "Pellet Stove Service" },
  { value: "installation", label: "Fireplace Installation" },
  { value: "inspection", label: "Inspection" },
  { value: "cleaning", label: "Chimney Sweep / Cleaning" },
  { value: "repair", label: "Repair" },
  { value: "estimate", label: "Estimate / Consultation" },
  { value: "follow-up", label: "Follow-up" },
  { value: "custom", label: "Custom" },
];

export function jobTypeOptions(values: string[] = []) {
  const known = new Set(JOB_TYPE_OPTIONS.map((option) => option.value));
  return [...JOB_TYPE_OPTIONS, ...Array.from(new Set(values)).filter((value) => value && !known.has(value)).map((value) => ({ value, label: value }))];
}

export const MAX_CUSTOM_JOB_TYPE_LENGTH = 120;

export function resolveJobType(value: string, customJobType: string) {
  if (value !== "custom") return value;
  const custom = customJobType.trim();
  if (!custom) throw new Error("Enter a custom job type.");
  if (custom.length > MAX_CUSTOM_JOB_TYPE_LENGTH) throw new Error(`Custom job type must be ${MAX_CUSTOM_JOB_TYPE_LENGTH} characters or fewer.`);
  return custom;
}

export function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function scheduledDateLabel(value: string) {
  if (!value) return "No date set";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function scheduledTimeLabel(value: string) {
  if (!value) return "No time set";
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  if (hours > 23 || Number(match[2]) > 59) return value;
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

export function customerAddress(address?: { line1?: string; line2?: string; city?: string; state?: string; zip?: string }) {
  if (!address) return "";
  return [address.line1, address.line2, [address.city, address.state].filter(Boolean).join(", "), address.zip].filter(Boolean).join(" ").trim();
}

export async function requireJobResponse(response: Response, message: string) {
  if (!response.ok) throw new Error(`${message} (HTTP ${response.status}). Please try again.`);
  return response;
}

export async function fetchJobArray<T>(url: string, key: string, signal?: AbortSignal): Promise<T[]> {
  const response = await requireJobResponse(await fetch(url, { signal, cache: "no-store" }), `Could not load ${key}`);
  const data = await response.json();
  if (!Array.isArray(data[key])) throw new Error(`Could not load ${key}: invalid response. Please try again.`);
  return data[key];
}
