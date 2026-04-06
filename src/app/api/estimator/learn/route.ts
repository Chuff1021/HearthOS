import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { getClientFromTokens } from "@/lib/quickbooks/sync";
import { buildEstimatorCatalog } from "@/lib/estimator-build-catalog";
import postgres from "postgres";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    const org = await getOrCreateDefaultOrg();
    if (!org.qbAccessToken || !org.qbRefreshToken || !org.qbRealmId) {
      await sql.end();
      return NextResponse.json({ error: "QuickBooks not connected" }, { status: 401 });
    }
    const client = getClientFromTokens(org.qbAccessToken, org.qbRefreshToken, org.qbRealmId);

    const { productCatalog, pricingSummary, installTypeGuide, invoiceCount, estimateCount } =
      await buildEstimatorCatalog(sql, client);

    await sql.end();

    return NextResponse.json({
      success: true,
      analyzed: {
        productsCataloged: Object.keys(productCatalog).length,
        invoices: invoiceCount,
        estimates: estimateCount,
        totalTransactions: invoiceCount + estimateCount,
        uniqueItems: Object.keys(pricingSummary).length,
        installTypeGuide,
        topItems: Object.values(pricingSummary)
          .sort((a: any, b: any) => b.timesUsed - a.timesUsed)
          .slice(0, 10)
          .map((i: any) => `${i.name}: $${i.avgPrice} avg (${i.timesUsed} times)`),
      },
    });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
