import { createHash } from "node:crypto";

export function stableUuid(input: string) {
  const hex = createHash("sha1").update(input).digest("hex").slice(0, 32);
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  // UUID version 5 (0101) and variant (10xx)
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const b = bytes.map((n) => n.toString(16).padStart(2, "0"));
  return `${b.slice(0, 4).join("")}-${b.slice(4, 6).join("")}-${b
    .slice(6, 8)
    .join("")}-${b.slice(8, 10).join("")}-${b.slice(10, 16).join("")}`;
}
