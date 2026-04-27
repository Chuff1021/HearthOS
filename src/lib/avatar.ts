// Deterministic avatar helpers used across vendor / customer / etc. profile cards.

const PALETTE = [
  "#FF4400", "#0EA5E9", "#16A34A", "#A855F7",
  "#EAB308", "#EF4444", "#14B8A6", "#F97316",
  "#3B82F6", "#10B981",
];

export function colorFromName(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function initialsFromName(s: string): string {
  const parts = (s || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
