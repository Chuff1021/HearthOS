import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { getClientFromTokens } from "@/lib/quickbooks/sync";
import { db, organizations } from "@/db";
import { eq } from "drizzle-orm";
import postgres from "postgres";

export const maxDuration = 120;

const QB_BASE_URL = process.env.QUICKBOOKS_ENVIRONMENT === "production"
  ? "https://quickbooks.api.intuit.com"
  : "https://sandbox-quickbooks.api.intuit.com";

async function getClientWithRefresh() {
  const org = await getOrCreateDefaultOrg();
  if (!org.qbAccessToken || !org.qbRefreshToken || !org.qbRealmId) {
    throw new Error("QuickBooks not connected");
  }
  let { qbAccessToken: token, qbRefreshToken: refresh, qbRealmId: realmId } = org;
  let client = getClientFromTokens(token, refresh, realmId);

  async function run<T>(fn: (c: typeof client) => Promise<T>): Promise<T> {
    try {
      return await fn(client);
    } catch {
      const tokens = await client.refreshAccessToken();
      token = tokens.access_token;
      refresh = tokens.refresh_token;
      await db.update(organizations).set({
        qbAccessToken: token,
        qbRefreshToken: refresh,
        qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        updatedAt: new Date(),
      }).where(eq(organizations.id, org.id));
      client = getClientFromTokens(token, refresh, realmId);
      return fn(client);
    }
  }

  return { run, getToken: () => token, getRealmId: () => realmId };
}

// Paginate through ALL active QB Items — no hard cap
async function fetchAllQBItems(
  run: <T>(fn: (c: any) => Promise<T>) => Promise<T>
): Promise<any[]> {
  const all: any[] = [];
  let startPos = 1;
  const pageSize = 500;
  for (;;) {
    const page = await run((c) =>
      c.queryPage(
        `SELECT * FROM Item WHERE Active = true STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`
      )
    ) as { rows: any[] };
    const rows: any[] = page.rows || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    startPos += pageSize;
  }
  return all;
}

// Parse a QB API error body into a human-readable string
function parseQBError(raw: string): string {
  try {
    const json = JSON.parse(raw);
    const errors: any[] = json?.Fault?.Error || [];
    if (errors.length > 0) {
      const e = errors[0];
      const detail = e.Detail || e.Message || "";
      const code = e.code ? ` (code ${e.code})` : "";
      return `${detail}${code}`.trim() || raw.slice(0, 300);
    }
  } catch {}
  return raw.slice(0, 300);
}

// POST a sparse update to QB — only changes PurchaseCost
// Requires a fresh item fetch so the SyncToken is never stale
async function updateItemCost(
  accessToken: string,
  realmId: string,
  freshItem: { Id: string; SyncToken: string; Name: string },
  newCost: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${QB_BASE_URL}/v3/company/${realmId}/item`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Id: freshItem.Id,
        SyncToken: freshItem.SyncToken,
        Name: freshItem.Name,       // QB Items require Name even in sparse updates
        sparse: true,
        PurchaseCost: newCost,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: parseQBError(text) };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// POST — update QB PurchaseCost for selected items
// Body: { items?: string[] }  — if omitted, updates all where qbCurrentCost === 0
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    const body = await request.json().catch(() => ({}));
    const specificItems: string[] | null = Array.isArray(body.items) ? body.items : null;

    // Load cost history from DB
    const rows = await sql`
      SELECT data FROM estimator_knowledge WHERE id = ${"cost-history"}
    `;
    if (rows.length === 0) {
      await sql.end();
      return NextResponse.json({ error: "No cost history found. Pull QB data first." }, { status: 400 });
    }

    const costHistory: Record<string, any> =
      typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;

    // Determine which items to update
    const toUpdate = Object.values(costHistory).filter((item: any) => {
      if (specificItems) return specificItems.includes(item.name);
      return item.qbCurrentCost === 0 && item.avgCost > 0;
    });

    if (toUpdate.length === 0) {
      await sql.end();
      return NextResponse.json({ updated: 0, message: "No items need cost updates." });
    }

    const { run, getToken, getRealmId } = await getClientWithRefresh();

    // Fetch ALL QB items (paginated — no 1000-item cap) to build name → QB ID map
    let qbItems: any[] = [];
    try {
      qbItems = await fetchAllQBItems(run);
    } catch (e: any) {
      await sql.end();
      return NextResponse.json({ error: `Failed to fetch QB items: ${e?.message || e}` }, { status: 500 });
    }

    // Index by both short Name AND FullyQualifiedName
    // Bills use the full path as item name; QB Items have the short Name
    const qbItemMap: Record<string, { id: string }> = {};
    for (const item of qbItems) {
      const name = item.Name || "";
      const fullName = item.FullyQualifiedName || name;
      if (name) qbItemMap[name] = { id: item.Id };
      if (fullName && fullName !== name) qbItemMap[fullName] = { id: item.Id };
    }

    const results: Array<{ name: string; cost: number; ok: boolean; error?: string }> = [];

    for (const item of toUpdate) {
      const qbRef = qbItemMap[item.name];
      if (!qbRef) {
        results.push({
          name: item.name,
          cost: 0,
          ok: false,
          error: `Not found in QB catalog (${qbItems.length} items checked). Name may not match QB exactly.`,
        });
        continue;
      }

      const costToSet = item.mostRecentCost || item.avgCost;

      // Fetch the item fresh from QB right before updating.
      // This guarantees we have the current SyncToken — stale tokens cause 5010 errors.
      let freshItem: any;
      try {
        freshItem = await run((c) => c.getItem(qbRef.id));
      } catch (e: any) {
        results.push({
          name: item.name,
          cost: costToSet,
          ok: false,
          error: `Failed to read item from QB: ${e?.message || e}`,
        });
        continue;
      }

      const result = await updateItemCost(
        getToken(),
        getRealmId(),
        { Id: freshItem.Id, SyncToken: freshItem.SyncToken, Name: freshItem.Name },
        costToSet
      );

      results.push({ name: item.name, cost: costToSet, ok: result.ok, error: result.error });

      // Reflect the update locally so the page refreshes correctly
      if (result.ok) {
        costHistory[item.name] = {
          ...costHistory[item.name],
          qbCurrentCost: costToSet,
          variance: 0,
          variancePct: 0,
        };
      }
    }

    // Persist updated cost history
    await sql`
      UPDATE estimator_knowledge
      SET data = ${JSON.stringify(costHistory)}::jsonb, updated_at = now()
      WHERE id = ${"cost-history"}
    `;
    await sql.end();

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({ updated: succeeded, failed, results });

  } catch (err: any) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
