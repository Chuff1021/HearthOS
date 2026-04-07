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

// Parse QB Fault JSON out of a thrown client error
function readQBError(e: any): string {
  const raw = String(e?.message || e);
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

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    const body = await request.json().catch(() => ({}));
    const specificItems: string[] | null = Array.isArray(body.items) ? body.items : null;

    // Load stored cost history
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

    // Fetch ALL QB items (paginated) to build the name → ID map
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

    // Index by both short Name AND FullyQualifiedName
    const qbItemMap: Record<string, string> = {};
    for (const qi of qbItems) {
      const n = (qi.Name || "").trim();
      const fn = (qi.FullyQualifiedName || n).trim();
      if (n) qbItemMap[n] = qi.Id;
      if (fn && fn !== n) qbItemMap[fn] = qi.Id;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Key insight: QB only stores PurchaseCost if the item has ExpenseAccountRef
    // set (i.e. "I purchase this from a vendor" is checked in QB).
    // If ExpenseAccountRef is missing, QB accepts the API call (200 OK) but
    // silently ignores PurchaseCost — which is why the pull shows the same items
    // again.
    //
    // Fix: find the ExpenseAccountRef used by items in the same category that
    // already have purchase costs configured. Use that as the default when the
    // target item is missing it. This is safe because we're borrowing an account
    // that's already in use for the same type of product in their own catalog.
    // ─────────────────────────────────────────────────────────────────────────

    // Build: category → most common ExpenseAccountRef among items with a cost set
    const categoryAccountMap: Record<string, { ref: any; count: number }> = {};
    let globalBestRef: any = null;
    let globalBestCount = 0;

    for (const qi of qbItems) {
      if (!qi.ExpenseAccountRef) continue;
      if (Number(qi.PurchaseCost || 0) <= 0) continue;

      const cat = (qi.FullyQualifiedName || qi.Name || "").split(":")[0].trim();
      const refKey = qi.ExpenseAccountRef.value;

      if (!categoryAccountMap[cat]) {
        categoryAccountMap[cat] = { ref: qi.ExpenseAccountRef, count: 0 };
      }
      // Keep the most frequent one per category
      if (categoryAccountMap[cat].ref.value === refKey) {
        categoryAccountMap[cat].count++;
      } else if (categoryAccountMap[cat].count === 0) {
        categoryAccountMap[cat] = { ref: qi.ExpenseAccountRef, count: 1 };
      }

      // Track global fallback
      if (categoryAccountMap[cat].count > globalBestCount) {
        globalBestCount = categoryAccountMap[cat].count;
        globalBestRef = qi.ExpenseAccountRef;
      }
    }

    const results: Array<{
      name: string;
      cost: number;
      ok: boolean;
      error?: string;
      skipped?: boolean;
    }> = [];

    for (const item of toUpdate) {
      const qbId =
        qbItemMap[item.name] ||
        qbItemMap[(item.fullName || "").trim()];

      if (!qbId) {
        results.push({
          name: item.name,
          cost: 0,
          ok: false,
          error: `Not found in QB catalog (${qbItems.length} items checked)`,
        });
        continue;
      }

      const costToSet = Number(
        (item.mostRecentCost > 0 ? item.mostRecentCost : item.avgCost).toFixed(2)
      );

      // Fetch the item fresh — guaranteed current SyncToken, full field set
      let freshItem: any;
      try {
        freshItem = await run((c) => c.getItem(qbId));
      } catch (e: any) {
        results.push({
          name: item.name,
          cost: costToSet,
          ok: false,
          error: `Could not read item from QB: ${readQBError(e)}`,
        });
        continue;
      }

      // QB Category items cannot have purchase costs — skip them
      if (freshItem.Type === "Category") {
        results.push({
          name: item.name,
          cost: costToSet,
          ok: false,
          skipped: true,
          error: "QB Category items cannot have a purchase cost",
        });
        continue;
      }

      // Build the update payload
      const updatePayload: Record<string, unknown> = {
        PurchaseCost: costToSet,
      };

      // If the item has no ExpenseAccountRef, QB will silently ignore PurchaseCost.
      // Set one from the same category, or fall back to the global most-common one.
      if (!freshItem.ExpenseAccountRef) {
        const itemCat = (freshItem.FullyQualifiedName || freshItem.Name || "")
          .split(":")[0]
          .trim();
        const catRef = categoryAccountMap[itemCat]?.ref || globalBestRef;
        if (catRef) {
          updatePayload.ExpenseAccountRef = catRef;
        }
        // If we have no reference at all we'll still try — QB may handle it
      }

      // POST the update using the fresh item we already have.
      // patchItem spreads the full QB object so SyncToken and all required fields
      // are present — no second round-trip to getItem.
      let updatedItem: any;
      try {
        updatedItem = await run((c) =>
          c.patchItem(freshItem, updatePayload)
        );
      } catch (e: any) {
        results.push({
          name: item.name,
          cost: costToSet,
          ok: false,
          error: readQBError(e),
        });
        continue;
      }

      // ── Verify QB actually stored the new cost ──────────────────────────────
      // QB silently ignores PurchaseCost if the item isn't set up as purchasable.
      // The only way to know is to check the value QB echoes back in the response.
      const storedCost = Number((updatedItem as any).PurchaseCost || 0);
      const tolerance = 0.02;

      if (Math.abs(storedCost - costToSet) > tolerance) {
        // QB returned a different value — it didn't persist our change
        const hint = !freshItem.ExpenseAccountRef && !updatePayload.ExpenseAccountRef
          ? " No expense account could be found to assign — open this item in QB and enable 'I purchase this product/service from a vendor'."
          : " QB did not save the cost despite the update succeeding — check the item's purchase settings in QB.";
        results.push({
          name: item.name,
          cost: costToSet,
          ok: false,
          error: `QB stored $${storedCost.toFixed(2)} instead of $${costToSet.toFixed(2)}.${hint}`,
        });
        continue;
      }
      // ────────────────────────────────────────────────────────────────────────

      results.push({ name: item.name, cost: costToSet, ok: true });

      // Update local cost history to match what QB now holds
      costHistory[item.name] = {
        ...costHistory[item.name],
        qbCurrentCost: storedCost,
        variance: Number((item.avgCost - storedCost).toFixed(2)),
        variancePct:
          storedCost > 0
            ? Number((((item.avgCost - storedCost) / storedCost) * 100).toFixed(1))
            : null,
      };
    }

    // Save updated cost history
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
