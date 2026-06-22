import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, organizations } from "@/db";
import { createQuickBooksClient } from "@/lib/quickbooks/client";
import { getOrCreateDefaultOrg } from "@/lib/org";
import {
  persistCustomersToDb,
  persistEstimatesToDb,
  persistInvoicesToDb,
  persistItemsToDb,
  persistPaymentsToDb,
  persistPurchaseOrdersToDb,
  persistVendorsToDb,
} from "@/lib/quickbooks/sync";

export const maxDuration = 300;

type SyncResult = {
  entity: string;
  fetched: number;
  persisted: number;
  ms: number;
  success: boolean;
  error?: string;
};

async function persistTokensIfChanged(client: ReturnType<typeof createQuickBooksClient>, orgId: string, originalAccessToken: string) {
  const tokens = client.getTokens();
  if (!tokens || tokens.access_token === originalAccessToken) return;

  await db
    .update(organizations)
    .set({
      qbAccessToken: tokens.access_token,
      qbRefreshToken: tokens.refresh_token,
      qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

async function runStep<T>(
  entity: string,
  fetchRows: () => Promise<T[]>,
  persistRows: (rows: T[]) => Promise<number>,
): Promise<SyncResult> {
  const start = Date.now();
  try {
    const rows = await fetchRows();
    const persisted = await persistRows(rows);
    return { entity, fetched: rows.length, persisted, ms: Date.now() - start, success: true };
  } catch (err) {
    return {
      entity,
      fetched: 0,
      persisted: 0,
      ms: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const started = Date.now();
  const org = await getOrCreateDefaultOrg();

  if (!org.qbAccessToken || !org.qbRefreshToken || !org.qbRealmId) {
    return NextResponse.json({ success: false, error: "Not connected to QuickBooks" }, { status: 401 });
  }

  const client = createQuickBooksClient();
  client.setTokens({
    access_token: org.qbAccessToken,
    refresh_token: org.qbRefreshToken,
    expires_in: 3600,
    x_refresh_token_expires_in: 8726400,
    token_type: "bearer",
  });
  client.setRealmId(org.qbRealmId);

  const results: SyncResult[] = [];

  async function refreshAndRetry<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch {
      await client.refreshAccessToken();
      await persistTokensIfChanged(client, org.id, org.qbAccessToken!);
      return fn();
    }
  }

  results.push(await runStep("customers", () => refreshAndRetry(() => client.getAllCustomers()), (rows) => persistCustomersToDb(org.id, rows)));
  results.push(await runStep("vendors", () => refreshAndRetry(() => client.getAllVendors() as Promise<any[]>), (rows) => persistVendorsToDb(org.id, rows)));
  results.push(await runStep("items", () => refreshAndRetry(() => client.getAllItems()), (rows) => persistItemsToDb(org.id, rows)));
  results.push(await runStep("estimates", () => refreshAndRetry(() => client.getAllEstimates() as Promise<any[]>), (rows) => persistEstimatesToDb(org.id, rows)));
  results.push(await runStep("purchase-orders", () => refreshAndRetry(() => client.getAllPurchaseOrders() as Promise<any[]>), (rows) => persistPurchaseOrdersToDb(org.id, rows)));

  const invoiceStart = Date.now();
  try {
    let fetched = 0;
    let persisted = 0;
    let startPosition = 1;
    const pageSize = 500;

    for (;;) {
      const page = await refreshAndRetry(() =>
        client.queryPage<any>(`SELECT * FROM Invoice ORDERBY TxnDate DESC STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`),
      );
      fetched += page.rows.length;
      persisted += await persistInvoicesToDb(org.id, page.rows);
      if (page.rows.length < pageSize) break;
      startPosition += pageSize;
    }

    results.push({ entity: "invoices", fetched, persisted, ms: Date.now() - invoiceStart, success: true });
  } catch (err) {
    results.push({
      entity: "invoices",
      fetched: 0,
      persisted: 0,
      ms: Date.now() - invoiceStart,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  results.push(await runStep("payments", () => refreshAndRetry(() => client.getAllPayments()), (rows) => persistPaymentsToDb(org.id, rows)));

  await persistTokensIfChanged(client, org.id, org.qbAccessToken);

  const success = results.every((result) => result.success);
  return NextResponse.json({
    success,
    totalMs: Date.now() - started,
    results,
  }, { status: success ? 200 : 207 });
}
