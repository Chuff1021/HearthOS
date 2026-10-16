import { randomUUID } from "node:crypto";
import { CommerceError, supplierUrl } from "./domain";
import { parseSupplierPage } from "./parser";
import {
  commerceDb,
  readParts,
  saveOffer,
  saveScanError,
  type PartRow,
} from "./store";

const origin = "https://www.stove-parts-unlimited.com";
const agent = "AaronsPartsInventory/1.0 (+https://aaronsfireplaceco.com)";
export class SupplierError extends CommerceError {
  constructor(
    message: string,
    public retrySeconds = 3600,
    public block = false,
  ) {
    super(message, 503);
  }
}
export async function fetchSupplier(
  url: string,
  request: typeof fetch = fetch,
) {
  supplierUrl(url);
  let current = url;
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await request(current, {
      headers: { "User-Agent": agent, Accept: "text/html,application/xml" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get("location") || "", current);
      supplierUrl(next.href);
      await response.body?.cancel();
      current = next.href;
      continue;
    }
    if ([403, 429, 503].includes(response.status)) {
      const retry = response.headers.get("retry-after") || "";
      const seconds = /^\d+$/.test(retry)
        ? Number(retry)
        : Math.ceil((Date.parse(retry) - Date.now()) / 1000);
      throw new SupplierError(
        `Supplier HTTP ${response.status}; scanning paused.`,
        Math.max(900, Number.isFinite(seconds) ? seconds : 3600),
        true,
      );
    }
    if (!response.ok)
      throw new SupplierError(
        `Supplier HTTP ${response.status}; availability needs review.`,
        response.status === 404 ? 86400 : 3600,
      );
    const reader = response.body?.getReader();
    if (!reader) throw new SupplierError("Empty supplier response.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > 4_000_000)
          throw new SupplierError("Oversized supplier response.");
        chunks.push(r.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new SupplierError("Unexpected supplier redirect loop.");
}
export function robotsPermitProducts(robots: string) {
  // Honor specific group when present, otherwise the wildcard group.
  const groups: Array<{ agents: string[]; rules: string[] }> = [];
  let group = { agents: [] as string[], rules: [] as string[] };
  for (const line of robots.split(/\r?\n/)) {
    const m = line
      .replace(/#.*/, "")
      .trim()
      .match(/^(user-agent|disallow|allow):\s*(.*)$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === "user-agent") {
      if (group.rules.length) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(m[2].toLowerCase());
    } else group.rules.push(`${m[1].toLowerCase()}:${m[2]}`);
  }
  groups.push(group);
  const selected = groups.filter((g) =>
    g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)),
  );
  const rules = (
    selected.length ? selected : groups.filter((g) => g.agents.includes("*"))
  ).flatMap((g) => g.rules);
  return (
    robots.length > 20 &&
    !rules.some((r) => r === "disallow:/" || r === "disallow:/*")
  );
}
export async function scannerReady(org: string) {
  const sql = commerceDb();
  await sql`INSERT INTO hearth_parts_scanner(org_id) VALUES(${org}) ON CONFLICT DO NOTHING`;
  const [state] =
    await sql`SELECT * FROM hearth_parts_scanner WHERE org_id=${org}`;
  if (
    state.blocked_until &&
    new Date(state.blocked_until).getTime() > Date.now()
  )
    throw new SupplierError("Supplier scanning is paused.");
  if (
    !state.robots_checked_at ||
    Date.now() - new Date(state.robots_checked_at).getTime() > 86400000
  ) {
    const robots = await fetchSupplier(`${origin}/robots.txt`);
    const allowed = robotsPermitProducts(robots);
    await sql`UPDATE hearth_parts_scanner SET robots_checked_at=now(),robots_allowed=${allowed} WHERE org_id=${org}`;
    if (!allowed)
      throw new SupplierError(
        "Supplier robots policy requires review.",
        86400,
        true,
      );
  } else if (!state.robots_allowed)
    throw new SupplierError(
      "Supplier robots policy requires review.",
      86400,
      true,
    );
}
async function rateSlot(org: string) {
  const sql = commerceDb();
  const rows =
    await sql`UPDATE hearth_parts_scanner SET next_request_at=now()+interval '1 second'
    WHERE org_id=${org} AND next_request_at<=now() AND (blocked_until IS NULL OR blocked_until<=now()) RETURNING org_id`;
  return rows.length > 0;
}
export async function scanPart(org: string, row: PartRow, lease?: string) {
  try {
    let acquired = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (await rateSlot(org)) {
        acquired = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1050));
    }
    if (!acquired) throw new SupplierError("Scanner busy; retry shortly.", 5);
    const html = await fetchSupplier(row.url);
    const offer = parseSupplierPage(html, row.url, {
      sku: row.sku,
      sourceId: row.source_id,
    });
    await saveOffer(org, row, offer, lease);
    return offer;
  } catch (e) {
    const error =
      e instanceof CommerceError
        ? e
        : new SupplierError("Supplier could not be verified.");
    const seconds = e instanceof SupplierError ? e.retrySeconds : 3600;
    await saveScanError(org, row.key, error.message, seconds, lease);
    if (e instanceof SupplierError && e.block) {
      const sql = commerceDb();
      await sql`UPDATE hearth_parts_scanner SET blocked_until=now()+make_interval(secs=>${seconds}),last_error=${e.message} WHERE org_id=${org}`;
    }
    throw error;
  }
}
export async function refreshCart(org: string, keys: string[]) {
  await scannerReady(org);
  let rows = await readParts(org, keys);
  if (rows.length !== keys.length)
    throw new CommerceError("One or more parts need an online quote.", 409);
  for (const row of rows) {
    const sql = commerceDb();
    await sql`UPDATE hearth_parts SET active_until=now()+interval '24 hours',next_scan_at=least(next_scan_at,now()+interval '15 minutes') WHERE org_id=${org} AND key=${row.key}`;
    if (
      !row.offer ||
      row.last_error ||
      !row.last_verified_at ||
      Date.now() - new Date(row.last_verified_at).getTime() > 60000
    ) {
      // Shared rate limit also applies to checkout; never create a second crawler.
      await new Promise((resolve) => setTimeout(resolve, 1050));
      await scanPart(org, row);
    }
  }
  rows = await readParts(org, keys);
  return rows;
}
export async function discover(org: string) {
  const sql = commerceDb();
  const [state] =
    await sql`SELECT * FROM hearth_parts_scanner WHERE org_id=${org}`;
  if (
    state.last_discovery_at &&
    Date.now() - new Date(state.last_discovery_at).getTime() < 86400000
  )
    return;
  if (!(await rateSlot(org))) return;
  const page = Number(state.discovery_page) || 1;
  const xml = await fetchSupplier(
    `${origin}/xmlsitemap.php?type=products&page=${page}`,
  );
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
  if (!xml.includes("<urlset") || !urls.length)
    throw new SupplierError("Supplier sitemap changed.");
  for (const url of urls) supplierUrl(url);
  await sql`INSERT INTO hearth_parts_discovery(org_id,url)
    SELECT ${org},value FROM jsonb_array_elements_text(${sql.json(urls)}) AS d(value)
    WHERE NOT EXISTS(SELECT 1 FROM hearth_parts p WHERE p.org_id=${org} AND p.url=d.value) ON CONFLICT DO NOTHING`;
  await sql`UPDATE hearth_parts_scanner SET discovery_page=${page === 4 ? 1 : page + 1},last_discovery_at=CASE WHEN ${page}=4 THEN now() ELSE last_discovery_at END,discovered=(SELECT count(*) FROM hearth_parts_discovery WHERE org_id=${org} AND reviewed=false) WHERE org_id=${org}`;
}
export async function runScanBatch(org: string, budgetMs = 45000) {
  await scannerReady(org);
  const sql = commerceDb(),
    started = Date.now();
  let checked = 0,
    failed = 0,
    paused = false;
  try {
    await discover(org);
  } catch (e) {
    failed++;
    if (e instanceof SupplierError && e.block) {
      await sql`UPDATE hearth_parts_scanner SET blocked_until=now()+make_interval(secs=>${e.retrySeconds}),last_error=${e.message} WHERE org_id=${org}`;
      paused = true;
    }
  }
  async function worker() {
    while (!paused && Date.now() - started < budgetMs - 25000) {
      const token = randomUUID();
      const [row] = await sql<
        PartRow[]
      >`UPDATE hearth_parts SET lease_until=now()+interval '2 minutes',lease_token=${token}
        WHERE org_id=${org} AND key=(SELECT key FROM hearth_parts WHERE org_id=${org} AND next_scan_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY (active_until>now()) DESC NULLS LAST,next_scan_at,key FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
      if (!row) break;
      try {
        await scanPart(org, row, token);
        checked++;
      } catch (e) {
        failed++;
        if (e instanceof SupplierError && e.block) paused = true;
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return { checked, failed };
}

export async function publishDiscoveredPart(
  org: string,
  url: string,
  metadata: { brand: string; department: string; partType: string },
) {
  const sql = commerceDb();
  supplierUrl(url);
  await scannerReady(org);
  const [discovered] =
    await sql`SELECT url FROM hearth_parts_discovery WHERE org_id=${org} AND url=${url} AND reviewed=false`;
  if (!discovered)
    throw new CommerceError("This supplier page is not awaiting review.", 409);
  if (!(await rateSlot(org)))
    throw new CommerceError("Scanner busy. Try again shortly.", 409);
  const offer = parseSupplierPage(await fetchSupplier(url), url);
  const slug = offer.sku
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const catalog = {
    ...offer.catalog,
    sku: offer.sku,
    productId: offer.sourceId,
    productUrl: url,
    slug,
    ...metadata,
    discovered: true,
  };
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as import("postgres").Sql;
    await tx`INSERT INTO hearth_parts(org_id,key,sku,source_id,url,catalog,offer,last_verified_at,next_scan_at)
      VALUES(${org},${offer.key},${offer.sku},${offer.sourceId},${url},${tx.json(catalog)},${tx.json(JSON.parse(JSON.stringify(offer)))},${offer.checkedAt},now()+interval '24 hours') ON CONFLICT DO NOTHING`;
    await tx`UPDATE hearth_parts SET duplicate=true WHERE org_id=${org} AND sku=${offer.sku} AND (SELECT count(*) FROM hearth_parts WHERE org_id=${org} AND sku=${offer.sku})>1`;
    await tx`UPDATE hearth_parts_discovery SET reviewed=true WHERE org_id=${org} AND url=${url}`;
    await tx`INSERT INTO hearth_parts_history(org_id,key,kind,payload) VALUES(${org},${offer.key},'catalog_published',${tx.json(catalog)})`;
  });
  return { key: offer.key, sku: offer.sku };
}
