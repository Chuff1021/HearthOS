import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { getClientFromTokens } from "@/lib/quickbooks/sync";
import { db, organizations } from "@/db";
import { eq } from "drizzle-orm";
import postgres from "postgres";

export const maxDuration = 120;

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
      // Token expired — refresh once and retry
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

  return { run };
}

// Paginate through ALL active QB Items — no hard 1000-item cap
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

// Extract a readable message from a QB API error thrown by the client
function readQBError(e: any): string {
  const raw = String(e?.message || e);
  // The client wraps QB errors as: "QuickBooks API error: {JSON}"
  const jsonStart = raw.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const json = JSON.parse(raw.slice(jsonStart));
      const errors: any[] = json?.Fault?.Error || [];
      if (errors.length > 0) {
        const err = errors[0];
        return (err.Detail || err.Message || raw).trim();
      }
    } catch {}
  }
  return raw.slice(0, 400);
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
      return NextResponse.json(
        { error: "No cost history found. Click 'Pull Latest QB Data' first." },
        { status: 400 }
      );
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

    const { run } = await getClientWithRefresh();

    // Fetch ALL QB items (paginated) to build name → QB ID map
    let qbItems: any[] = [];
    try {
      qbItems = await fetchAllQBItems(run);
    } catch (e: any) {
      await sql.end();
      return NextResponse.json(
        { error: `Failed to fetch QB item list: ${readQBError(e)}` },
        { status: 500 }
      );
    }

    // Index by both short Name AND FullyQualifiedName so we match
    // regardless of whether the bill line used the short or full path
    const qbItemMap: Record<string, string> = {}; // name → QB Id
    for (const item of qbItems) {
      const name = (item.Name || "").trim();
      const fullName = (item.FullyQualifiedName || name).trim();
      if (name) qbItemMap[name] = item.Id;
      if (fullName && fullName !== name) qbItemMap[fullName] = item.Id;
    }

    const results: Array<{ name: string; cost: number; ok: boolean; error?: string }> = [];

    for (const item of toUpdate) {
      const qbId = qbItemMap[item.name] || qbItemMap[(item.fullName || "").trim()];

      if (!qbId) {
        results.push({
          name: item.name,
          cost: 0,
          ok: false,
          error: `Not found in QB (searched ${qbItems.length} active items by Name and FullyQualifiedName)`,
        });
        continue;
      }

      // Use the most recent actual price paid; fall back to average
      const costToSet = Number(
        (item.mostRecentCost > 0 ? item.mostRecentCost : item.avgCost).toFixed(2)
      );

      // client.updateItem():
      //   1. Fetches the full item fresh from QB → guaranteed current SyncToken
      //   2. Merges our change into the full object
      //   3. POSTs back with sparse:true
      // This is identical to how updateCustomer / updateInvoice work.
      try {
        await run((c) => c.updateItem(qbId, { PurchaseCost: costToSet }));

        results.push({ name: item.name, cost: costToSet, ok: true });

        // Reflect in local cost history so the page refreshes accurately
        costHistory[item.name] = {
          ...costHistory[item.name],
          qbCurrentCost: costToSet,
          variance: 0,
          variancePct: 0,
        };
      } catch (e: any) {
        results.push({
          name: item.name,
          cost: costToSet,
          ok: false,
          error: readQBError(e),
        });
      }
    }

    // Persist updated cost history back to DB
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
    return NextResponse.json({ error: readQBError(err) }, { status: 500 });
  }
}
