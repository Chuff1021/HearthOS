import { NextRequest, NextResponse } from "next/server";
import { db, inventoryItems, invoiceLineItems, invoices } from "@/db";
import { and, eq, gte, sql, isNotNull, inArray } from "drizzle-orm";
import { getOrCreateDefaultOrg } from "@/lib/org";

// Fireplace catalog — every distinct unit sold in the last 24 months that the
// estimator will recognize. Used to give the secretary a transparent list of
// "what fireplaces does the estimator know about?" and so they can verify
// the matcher will hit their commonly sold models (864, DRT3040, 42 Apex, etc).
//
// Pure SQL aggregation, no precomputation — always reflects the current invoice
// history the estimator itself reads from.

const ACCESSORY_RE = /pipe\b|chase\s*cover|\bcap\b|term|firestop|storm|attic|shield|flashing|adapter|connector|liner|flex\s*kit|gasket|bracket|trim\b|stone|veneer|masonry|mantel|mantle|users?'?\s*charge|sales\s*tax|use\s*tax|service|install\b|labor|clean|repair|delivery|elbow|firescreen|log\s*set|logset|valve|thermo|ignit(?:or|er)|remote|blower|fan\s*kit|battery|filter|brick|panel|liner|liner\s*kit|baffle|gasket/i;

type CatalogEntry = {
  qbItemId: string;
  name: string;
  sku: string | null;
  unitPrice: number | null;
  brand: string | null;
  topDescription: string;
  invoiceCount: number;
  lastSoldDate: string | null;
  mostRecentPrice: number;
  searchTokens: string[];
};

function detectBrand(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bxtrordinair|fpx|travis|apex|elite\b/.test(t)) return "Fireplace Xtrordinair (Travis)";
  if (/\bsuperior\b|\bdrt\d|f4\d{3}|f0\d{3}|f5\d{3}|f1\d{3}/.test(t)) return "Superior";
  if (/\bmajestic|biltmore|marquis|meridan/.test(t)) return "Majestic";
  if (/\bnapoleon|elevation/.test(t)) return "Napoleon";
  if (/\bheat\s*&?\s*glo|h&g/.test(t)) return "Heat & Glo";
  if (/\bheatilator/.test(t)) return "Heatilator";
  if (/\benviro|m55/.test(t)) return "Enviro";
  if (/\bquadra[ -]?fire/.test(t)) return "Quadra-Fire";
  if (/\blopi\b/.test(t)) return "Lopi";
  if (/\bregency\b/.test(t)) return "Regency";
  if (/\bprobuilder\b/.test(t)) return "ProBuilder";
  return null;
}

function buildTokens(text: string): string[] {
  const out = new Set<string>();
  const cleaned = text.toLowerCase().replace(/[-/\\:.,()]/g, " ").replace(/[^a-z0-9 ]/g, " ");
  for (const w of cleaned.split(/\s+/)) {
    if (!w || w.length < 2) continue;
    if (/^\d+$/.test(w) && w.length > 6) continue; // skip long numeric ids (qb refs)
    out.add(w);
  }
  return [...out];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const monthsBack = Math.max(1, Math.min(60, parseInt(searchParams.get("monthsBack") || "24", 10)));
    const minSold = Math.max(1, parseInt(searchParams.get("minSold") || "1", 10));
    const minPrice = Math.max(0, parseInt(searchParams.get("minPrice") || "1500", 10));
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    const org = await getOrCreateDefaultOrg();

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Pull every line over the price floor in the window, joined to inventory
    const lines = await db
      .select({
        qbItemId: invoiceLineItems.qbItemId,
        description: invoiceLineItems.description,
        unitPrice: invoiceLineItems.unitPrice,
        issueDate: invoices.issueDate,
        invoiceId: invoices.id,
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
      .where(and(
        eq(invoices.orgId, org.id),
        gte(invoices.issueDate, cutoffStr),
        isNotNull(invoiceLineItems.qbItemId),
        sql`${invoiceLineItems.unitPrice}::numeric >= ${minPrice}`,
      ));

    // Aggregate per qb_item_id: most-frequent description, latest price, count
    type Agg = {
      qbItemId: string;
      descCounts: Map<string, number>;
      invoices: Set<string>;
      latestDate: string | null;
      latestPrice: number;
    };
    const aggByQb = new Map<string, Agg>();
    for (const l of lines) {
      if (!l.qbItemId) continue;
      const desc = (l.description || "").trim();
      if (!desc) continue;
      // Strip lines whose description is clearly an accessory / service
      if (ACCESSORY_RE.test(desc)) continue;
      const a = aggByQb.get(l.qbItemId) || {
        qbItemId: l.qbItemId,
        descCounts: new Map<string, number>(),
        invoices: new Set<string>(),
        latestDate: null as string | null,
        latestPrice: 0,
      };
      a.descCounts.set(desc, (a.descCounts.get(desc) ?? 0) + 1);
      a.invoices.add(l.invoiceId);
      const dateStr = l.issueDate || null;
      if (dateStr && (!a.latestDate || dateStr > a.latestDate)) {
        a.latestDate = dateStr;
        a.latestPrice = Number(l.unitPrice ?? 0);
      }
      aggByQb.set(l.qbItemId, a);
    }

    // Filter by min sold count
    const candidates = [...aggByQb.values()].filter((a) => a.invoices.size >= minSold);
    if (candidates.length === 0) {
      return NextResponse.json({ window: { monthsBack, cutoff: cutoffStr }, count: 0, units: [] });
    }

    // Pull inventory rows for the candidates to get the canonical name + price
    const ids = candidates.map((c) => c.qbItemId);
    const invRows = await db
      .select({
        qbItemId: inventoryItems.qbItemId,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
        unitPrice: inventoryItems.unitPrice,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, org.id), inArray(inventoryItems.qbItemId, ids)));
    const invByQb = new Map(invRows.map((r) => [r.qbItemId!, r]));

    const units: CatalogEntry[] = [];
    for (const a of candidates) {
      const inv = invByQb.get(a.qbItemId);
      // Top description by frequency (the one most commonly used on invoices)
      let topDesc = "";
      let topCount = 0;
      for (const [d, n] of a.descCounts) {
        if (n > topCount) { topDesc = d; topCount = n; }
      }
      const cleanDesc = topDesc.split(/\n/)[0].trim();
      const name = inv?.name || cleanDesc;
      // Filter out anything that looks like an accessory based on the canonical
      // inventory name too — invoices can mis-label things
      if (ACCESSORY_RE.test(name)) continue;
      const brand = detectBrand(name + " " + cleanDesc);
      units.push({
        qbItemId: a.qbItemId,
        name,
        sku: inv?.sku ?? null,
        unitPrice: inv?.unitPrice != null ? Number(inv.unitPrice) : null,
        brand,
        topDescription: cleanDesc,
        invoiceCount: a.invoices.size,
        lastSoldDate: a.latestDate,
        mostRecentPrice: a.latestPrice,
        searchTokens: buildTokens(name + " " + cleanDesc),
      });
    }

    // Filter by query if provided
    let filtered = units;
    if (q) {
      const qTokens = q.split(/\s+/).filter(Boolean);
      filtered = units.filter((u) => qTokens.every((qt) => u.searchTokens.some((t) => t.includes(qt))));
    }

    filtered.sort((a, b) => b.invoiceCount - a.invoiceCount || b.mostRecentPrice - a.mostRecentPrice);

    return NextResponse.json({
      window: { monthsBack, cutoff: cutoffStr },
      thresholds: { minSold, minPrice },
      query: q || null,
      count: filtered.length,
      brands: [...new Set(filtered.map((u) => u.brand).filter(Boolean))].sort(),
      units: filtered,
    });
  } catch (err: any) {
    console.error("Estimator catalog failed:", err);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
