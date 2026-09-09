import type { CSSProperties } from "react";

type Technician = { id: string; color?: string | null };

export const UNASSIGNED_TECH_COLOR = "#64748b";
const PALETTE = [
  "#2563eb", "#0f766e", "#7c3aed", "#be185d", "#a16207", "#0369a1",
  "#4d7c0f", "#c2410c", "#4f46e5", "#9f1239", "#15803d", "#a21caf",
];

function normalizedColor(value?: string | null): string | null {
  const hex = value?.trim().toLowerCase();
  if (hex && /^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (hex && /^#[0-9a-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map(char => char + char).join("")}`;
  return null;
}

function identityHash(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Presentation only: never replace the original directory or job assignment colors. */
export function buildScheduleTechColors(directory: readonly Technician[], historical: readonly Technician[] = []): Map<string, string> {
  const colors = new Map<string, string>();
  const used = new Set<string>();
  const seen = new Set<string>();
  const allocate = (records: readonly Technician[]) => {
    const sorted = [...records].filter(tech => tech.id).sort((a, b) => a.id.localeCompare(b.id) || (a.color || "").localeCompare(b.color || ""));
    const missing: Technician[] = [];
    // Reserve configured colors before allocating duplicate/default-color fallbacks.
    for (const tech of sorted) {
      if (seen.has(tech.id)) continue;
      seen.add(tech.id);
      const color = normalizedColor(tech.color);
      if (color && !used.has(color)) {
        colors.set(tech.id, color);
        used.add(color);
      } else missing.push(tech);
    }
    for (const tech of missing) {
      const hash = identityHash(tech.id);
      let color: string | undefined;
      for (let offset = 0; offset < PALETTE.length; offset++) {
        const candidate = PALETTE[(hash + offset) % PALETTE.length];
        if (!used.has(candidate)) { color = candidate; break; }
      }
      if (!color) {
        let hue = hash % 360;
        while (used.has(`hsl(${hue} 58% 43%)`)) hue = (hue + 137.508) % 360;
        color = `hsl(${hue} 58% 43%)`;
      }
      colors.set(tech.id, color);
      used.add(color);
    }
  };
  // Historical snapshots must not override the directory or change active staff colors.
  allocate(directory);
  allocate(historical);
  return colors;
}

export function technicianStyle(color: string): CSSProperties {
  return { "--schedule-tech-color": color } as CSSProperties;
}
