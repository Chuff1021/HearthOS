import { NextRequest, NextResponse } from "next/server";
import { db, organizations } from "@/db";
import { createQuickBooksClient } from "@/lib/quickbooks/client";
import {
  getQuickBooksCredentials,
  saveQuickBooksRefresh,
} from "@/lib/integrations/store";
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

async function persistTokensIfChanged(
  client: ReturnType<typeof createQuickBooksClient>,
  orgId: string,
  realmId: string,
  originalAccessToken: string,
) {
  const tokens = client.getTokens();
  if (!tokens || tokens.access_token === originalAccessToken) return;

  await saveQuickBooksRefresh({
    orgId,
    realmId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });
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

async function syncOrganization(org: typeof organizations.$inferSelect) {
  const started = Date.now();
  const credentials = await getQuickBooksCredentials(org);

  if (!credentials) {
    return {
      orgId: org.id,
      success: true,
      skipped: true,
      totalMs: Date.now() - started,
      results: [] as SyncResult[],
    };
  }
  const qbCredentials = credentials;

  const client = createQuickBooksClient();
  client.setTokens({
    access_token: qbCredentials.accessToken,
    refresh_token: qbCredentials.refreshToken,
    expires_in: 3600,
    x_refresh_token_expires_in: 8726400,
    token_type: "bearer",
  });
  client.setRealmId(qbCredentials.realmId);

  const results: SyncResult[] = [];

  async function refreshAndRetry<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch {
      await client.refreshAccessToken();
      await persistTokensIfChanged(client, org.id, qbCredentials.realmId, qbCredentials.accessToken);
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

  await persistTokensIfChanged(client, org.id, qbCredentials.realmId, qbCredentials.accessToken);

  const success = results.every((result) => result.success);
  return {
    orgId: org.id,
    success,
    skipped: false,
    totalMs: Date.now() - started,
    results,
  };
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const allOrganizations = await db.select().from(organizations);
  const organizationsResults = [];

  for (const organization of allOrganizations) {
    try {
      organizationsResults.push(await syncOrganization(organization));
    } catch (error) {
      organizationsResults.push({
        orgId: organization.id,
        success: false,
        skipped: false,
        totalMs: 0,
        results: [] as SyncResult[],
        error: error instanceof Error ? error.message : "QuickBooks sync failed",
      });
    }
  }

  const activeResults = organizationsResults.filter((result) => !result.skipped);
  const success = activeResults.every((result) => result.success);
  return NextResponse.json({
    success,
    totalMs: Date.now() - started,
    organizationsScanned: allOrganizations.length,
    organizationsSynced: activeResults.length,
    organizations: organizationsResults,
  }, { status: success ? 200 : 207 });
}
