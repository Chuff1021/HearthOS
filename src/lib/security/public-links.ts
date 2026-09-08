import { createHmac, timingSafeEqual } from "node:crypto";

type LinkClaims = { purpose: "payment" | "estimate"; document: string; maxCents?: number; expires: number };
function key() {
  const secret = process.env.HEARTHOS_PUBLIC_LINK_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Secure customer links are not configured.");
  return secret;
}
export function signCustomerLink(claims: Omit<LinkClaims, "expires">, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...claims, expires: now + 30 * 86400000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", key()).update(payload).digest("base64url")}`;
}
export function verifyCustomerLink(token: string, purpose: LinkClaims["purpose"], document: string, now = Date.now()): LinkClaims | null {
  try {
    if (token.length > 2048) return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = createHmac("sha256", key()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as LinkClaims;
    if (claims.purpose !== purpose || claims.document !== document || !Number.isFinite(claims.expires) || claims.expires <= now) return null;
    if (purpose === "payment" && (!Number.isSafeInteger(claims.maxCents) || Number(claims.maxCents) <= 0)) return null;
    return claims;
  } catch { return null; }
}
