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

// Update a single QB item's PurchaseCost via direct API call
async function updateItemCost(
  accessToken: string,
  realmId: string,
  itemId: string,
  syncToken: string,
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
        Id: itemId,
        SyncToken: syncToken,
        sparse: true,
        PurchaseCost: newCost,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// POST — update QB PurchaseCost for items that have no cost set
// Body: { items?: string[] }  — optional list of item names; if omitted, updates all with qbCurrentCost === 0
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

    // Determine which items need cost updates
    const toUpdate = Object.values(costHistory).filter((item: any) => {
      if (specificItems) return specificItems.includes(item.name);
      return item.qbCurrentCost === 0 && item.avgCost > 0;
    });

    if (toUpdate.length === 0) {
      await sql.end();
      return NextResponse.json({ updated: 0, message: "No items need cost updates." });
    }

    const { run, getToken, getRealmId } = await getClientWithRefresh();

    // Fetch all QB items to get Id + SyncToken (required for updates)
    let qbItems: any[] = [];
    try {
      qbItems = await run((c) => c.getItems(1000));
    } catch (e: any) {
      await sql.end();
      return NextResponse.json({ error: `Failed to fetch QB items: ${e?.message || e}` }, { status: 500 });
    }

    // Build name → { Id, SyncToken } map — index by BOTH short Name AND FullyQualifiedName
    // Bills use the full path as the item name, QB Items use the short name
    const qbItemMap: Record<string, { id: string; syncToken: string }> = {};
    for (const item of qbItems) {
      const name = item.Name || "";
      const fullName = item.FullyQualifiedName || name;
      if (name) qbItemMap[name] = { id: item.Id, syncToken: item.SyncToken };
      if (fullName && fullName !== name) qbItemMap[fullName] = { id: item.Id, syncToken: item.SyncToken };
    }

    // Update each item in QB
    const results: Array<{ name: string; cost: number; ok: boolean; error?: string }> = [];

    for (const item of toUpdate) {
      const qbRef = qbItemMap[item.name];
      if (!qbRef) {
        results.push({ name: item.name, cost: item.mostRecentCost, ok: false, error: "Item not found in QB item list" });
        continue;
      }

      // Use mostRecentCost (last price actually paid) — most accurate for current pricing
      const costToSet = item.mostRecentCost || item.avgCost;

      const result = await updateItemCost(
        getToken(),
        getRealmId(),
        qbRef.id,
        qbRef.syncToken,
        costToSet
      );

      results.push({ name: item.name, cost: costToSet, ok: result.ok, error: result.error });

      // Update local cost history to reflect new QB cost
      if (result.ok) {
        costHistory[item.name] = {
          ...costHistory[item.name],
          qbCurrentCost: costToSet,
          variance: 0,
          variancePct: 0,
        };
      }
    }

    // Save updated cost history back to DB
    await sql`
      UPDATE estimator_knowledge
      SET data = ${JSON.stringify(costHistory)}::jsonb, updated_at = now()
      WHERE id = ${"cost-history"}
    `;
    await sql.end();

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({
      updated: succeeded,
      failed,
      results,
    });

  } catch (err: any) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
