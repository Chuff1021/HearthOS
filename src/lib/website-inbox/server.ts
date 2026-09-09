import "server-only";
import postgres from "postgres";
import { websiteInboxConfig } from "./config";
import { parseExport } from "./domain";
import { createWebsiteInboxStore } from "./store";

let store: ReturnType<typeof createWebsiteInboxStore> | undefined;
export function websiteInboxStore() {
  if (!process.env.DATABASE_URL) throw new Error("Database unavailable");
  return store ??= createWebsiteInboxStore(postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 20, connect_timeout: 10 }));
}
export async function syncWebsiteInbox() {
  const config = websiteInboxConfig();
  if (!config) throw new Error("Website inbox is not configured");
  return websiteInboxStore().syncPage(config.orgId, config.source, async cursor => {
    const url = new URL(config.endpoint);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${config.secret}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!response.ok || !response.body) throw new Error("Website export unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > 6_000_000) throw new Error("Export page exceeds limit");
        chunks.push(result.value);
      }
      return parseExport(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } finally { await reader.cancel().catch(() => {}); }
  });
}
