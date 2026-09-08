import "server-only";
import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";

export async function authorizeCron() {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Scheduled task authentication is not configured." }, { status: 503 });
  const actual = Buffer.from((await headers()).get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
