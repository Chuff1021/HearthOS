import { NextRequest, NextResponse } from "next/server";
import { db, inventoryItems, invoices, invoiceLineItems, customers } from "@/db";
import { and, eq, inArray, sql, desc, ilike, or } from "drizzle-orm";
import { getOrCreateDefaultOrg } from "@/lib/org";

export const maxDuration = 60;

// Estimator: deterministic component aggregation from past invoices.
//
// Flow:
//   1. Match the fireplace unit from the prompt (token search against
//      inventory_items.name + the invoice line descriptions where that item
//      was used — the user-friendly model names like "42 Apex NexGen-Hybrid"
//      live in the invoice line description, not the inventory_items.name).
//   2. Pull the last N invoices that included that unit.
//   3. Tally every line item across those invoices: appearance count, avg qty,
//      most-recent price.
//   4. Keep components that appeared in ≥ 40% of those invoices.
//   5. Apply pipe-feet override only to literal pipe components, then a
//      Users Charge line at 4.22% of the materials subtotal.
//
// No QB API call, no AI inference for component selection. The user wanted
// "look at past invoices and figure out what we typically use" — that's pure
// data, not LLM territory.

const STOP_WORDS = new Set([
  "vertical", "horizontal", "insert", "install", "installation",
  "feet", "foot", "ft", "pipe", "with", "and", "the", "for", "of", "a",
  "service", "repair", "clean", "replace", "new", "chase", "cover",
  "delivers", "flashing", "an", "to", "in", "on", "is",
]);

function tokenize(prompt: string): string[] {
  const raw = prompt.toLowerCase().replace(/[-/\\:.,]/g, " ").split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i].replace(/[^a-z0-9]/g, "");
    if (!w || w.length < 2 || STOP_WORDS.has(w)) continue;
    const next = (raw[i + 1] || "").replace(/[^a-z0-9]/g, "");
    // Skip "20" before "feet" / "ft"
    if (/^\d+$/.test(w) && (STOP_WORDS.has(next) || /^(feet|foot|ft|pipe|inch|in)/.test(next))) continue;
    out.push(w);
  }
  return out;
}

function isPipeComponent(name: string | null, desc: string | null): boolean {
  const t = `${name ?? ""} ${desc ?? ""}`.toLowerCase();
  // Straight pipe sections only — not elbows, caps, terminations, fittings
  if (/elbow|cap|term|firestop|storm|attic|shield|flashing|adapter|connector|45|90|45deg|adjustable/.test(t)) return false;
  return /\bpipe\b|dva-\d+|sv\d+|7dt-?\d+|\b\d{2,3}dva-\d+\b/.test(t);
}

function isLaborComponent(name: string | null, desc: string | null): boolean {
  const t = `${name ?? ""} ${desc ?? ""}`.toLowerCase();
  return /services?[:/]|install\b|labor|clean|repair|service charge/.test(t);
}

function isTaxLine(name: string | null, desc: string | null): boolean {
  const t = `${name ?? ""} ${desc ?? ""}`.toLowerCase();
  return /\busers?'?\s*charge\b|\bsales\s*tax\b|\buse\s*tax\b/.test(t);
}

function isExcludedFromUnit(name: string | null, desc: string | null): boolean {
  const t = `${name ?? ""} ${desc ?? ""}`.toLowerCase();
  if (isPipeComponent(name, desc) || isLaborComponent(name, desc) || isTaxLine(name, desc)) return true;
  return /chase\s*cover|stone|veneer|masonry|mantel|mantle|trim\b|gasket|bracket|cap\b|firestop|flashing|connector|liner|flex kit|termination/.test(t);
}

type Candidate = {
  qbItemId: string;
  inventoryName: string;
  inventorySku: string | null;
  unitPrice: number;
  score: number;
  invoiceUseCount: number;
  topDescription: string;
};

export async function GET() {
  return NextResponse.json({ ok: true, route: "estimator/ai-generate", info: "POST {prompt, customerName} to generate" });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt: string = (body.prompt || "").toString();
    const customerName: string = (body.customerName || "").toString();
    if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

    const org = await getOrCreateDefaultOrg();

    // ── Parse prompt ──
    const pipeFeetMatch = prompt.match(/(\d+)\s*(?:ft|feet|foot|')/i);
    const pipeFeet = pipeFeetMatch ? Number(pipeFeetMatch[1]) : null;
    const isHorizontal = /horizontal/i.test(prompt);
    const isInsert = /\binsert\b|\bliner\b/i.test(prompt);
    const mentionsStone = /\bstone\b|\bveneer\b|\bmasonry\b/.test(prompt.toLowerCase());
    const mentionsMantel = /\bmantel\b|\bmantle\b/.test(prompt.toLowerCase());
    const mentionsChasecover = /chase\s*cover/i.test(prompt);
    const tokens = tokenize(prompt);

    if (tokens.length === 0) {
      return NextResponse.json({ error: "Couldn't parse a model from the prompt. Try '42 Apex vertical install'." }, { status: 400 });
    }

    // ── Find candidate fireplace units ──
    // Match against (a) inventory_items.name and (b) any past invoice line
    // description for that item. The friendly model name ("42 Apex
    // NexGen-Hybrid") lives in the line description, not the canonical name.
    const tokenLikes = tokens.map((t) => `%${t}%`);
    const liDescMatches = await db
      .select({
        qbItemId: invoiceLineItems.qbItemId,
        description: invoiceLineItems.description,
        uses: sql<number>`count(*)::int`,
      })
      .from(invoiceLineItems)
      .where(and(
        sql`${invoiceLineItems.qbItemId} is not null`,
        or(...tokenLikes.map((p) => ilike(invoiceLineItems.description, p))),
      ))
      .groupBy(invoiceLineItems.qbItemId, invoiceLineItems.description)
      .orderBy(sql`count(*) desc`)
      .limit(200);

    // Score by (#tokens matched in description) × (uses) — prioritize the
    // model the user actually meant, weighted by how often it's been sold.
    const scoreByQb = new Map<string, { score: number; uses: number; topDesc: string }>();
    for (const r of liDescMatches) {
      if (!r.qbItemId) continue;
      const desc = (r.description || "").toLowerCase();
      let matched = 0;
      for (const t of tokens) if (desc.includes(t)) matched++;
      if (matched === 0) continue;
      const cur = scoreByQb.get(r.qbItemId);
      const score = matched * matched * Math.log2(1 + Number(r.uses));
      if (!cur || score > cur.score) {
        scoreByQb.set(r.qbItemId, { score, uses: Number(r.uses), topDesc: r.description || "" });
      }
    }

    if (scoreByQb.size === 0) {
      return NextResponse.json({
        error: `No past invoices match "${prompt}". Try a model name like '42 Apex' or '36 Elite'.`,
        lineItems: [],
      }, { status: 404 });
    }

    // Pull the inventory rows for the candidate qb ids — apply price + name filters
    const candidateIds = [...scoreByQb.keys()];
    const invRows = await db
      .select({
        qbItemId: inventoryItems.qbItemId,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
        unitPrice: inventoryItems.unitPrice,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, org.id), inArray(inventoryItems.qbItemId, candidateIds)));

    const candidates: Candidate[] = [];
    for (const r of invRows) {
      if (!r.qbItemId) continue;
      const meta = scoreByQb.get(r.qbItemId);
      if (!meta) continue;
      const price = r.unitPrice != null ? Number(r.unitPrice) : 0;
      // Must look like a fireplace unit, not a part / accessory.
      if (isExcludedFromUnit(r.name, meta.topDesc)) continue;
      if (price > 0 && price < 800) continue;
      candidates.push({
        qbItemId: r.qbItemId,
        inventoryName: r.name,
        inventorySku: r.sku,
        unitPrice: price,
        score: meta.score,
        invoiceUseCount: meta.uses,
        topDescription: meta.topDesc,
      });
    }

    candidates.sort((a, b) => b.score - a.score || b.invoiceUseCount - a.invoiceUseCount);
    const matchedUnit = candidates[0];

    if (!matchedUnit) {
      return NextResponse.json({
        error: `Found matches in past invoices but none look like a fireplace unit. Add a price hint or try a different model.`,
        lineItems: [],
      }, { status: 404 });
    }

    // ── Pull last 30 invoices that included this unit ──
    const recentInvoices = await db
      .select({
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        issueDate: invoices.issueDate,
        totalAmount: invoices.totalAmount,
        firstName: customers.firstName,
        lastName: customers.lastName,
        companyName: customers.companyName,
      })
      .from(invoices)
      .innerJoin(invoiceLineItems, and(
        eq(invoiceLineItems.invoiceId, invoices.id),
        eq(invoiceLineItems.qbItemId, matchedUnit.qbItemId),
      ))
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .where(eq(invoices.orgId, org.id))
      .groupBy(invoices.id, invoices.invoiceNumber, invoices.issueDate, invoices.totalAmount,
               customers.firstName, customers.lastName, customers.companyName)
      .orderBy(desc(invoices.issueDate))
      .limit(30);

    const invoiceIds = recentInvoices.map((r) => r.invoiceId);
    if (invoiceIds.length === 0) {
      return NextResponse.json({
        error: `Matched ${matchedUnit.inventoryName} but no invoice history to draft from.`,
        lineItems: [],
      }, { status: 404 });
    }

    // ── Pull all lines from those invoices ──
    const allLines = await db
      .select({
        invoiceId: invoiceLineItems.invoiceId,
        qbItemId: invoiceLineItems.qbItemId,
        description: invoiceLineItems.description,
        quantity: invoiceLineItems.quantity,
        unitPrice: invoiceLineItems.unitPrice,
        total: invoiceLineItems.total,
      })
      .from(invoiceLineItems)
      .where(inArray(invoiceLineItems.invoiceId, invoiceIds))
      .orderBy(desc(invoiceLineItems.invoiceId));

    // ── Aggregate component frequency ──
    type Tally = {
      qbItemId: string | null;
      sampleDescription: string;
      appearances: Set<string>; // invoice ids
      qtys: number[];
      prices: number[];
      mostRecentPrice: number;
    };
    const tally = new Map<string, Tally>();
    for (const l of allLines) {
      // Skip the matched unit itself — we always include it explicitly later
      if (l.qbItemId === matchedUnit.qbItemId) continue;
      // Skip Users Charge — we recompute it after materials
      if (isTaxLine(null, l.description)) continue;
      const key = l.qbItemId || `desc:${(l.description || "").trim().toLowerCase()}`;
      if (!key) continue;
      const t = tally.get(key) || {
        qbItemId: l.qbItemId,
        sampleDescription: l.description || "",
        appearances: new Set<string>(),
        qtys: [],
        prices: [],
        mostRecentPrice: 0,
      };
      t.appearances.add(l.invoiceId);
      const q = Number(l.quantity ?? 0);
      const p = Number(l.unitPrice ?? 0);
      if (q > 0) t.qtys.push(q);
      if (p > 0) t.prices.push(p);
      if ((l.description || "").length > t.sampleDescription.length) t.sampleDescription = l.description || t.sampleDescription;
      // First seen is most recent (sorted desc by invoiceId / date)
      if (t.mostRecentPrice === 0 && p > 0) t.mostRecentPrice = p;
      tally.set(key, t);
    }

    const totalInvoices = invoiceIds.length;
    const minAppearances = Math.max(2, Math.ceil(totalInvoices * 0.4));

    // Look up qb item names for the components we'll keep
    const componentQbIds = [...tally.values()].map((t) => t.qbItemId).filter((x): x is string => !!x);
    const compInvRows = componentQbIds.length > 0
      ? await db
          .select({ qbItemId: inventoryItems.qbItemId, name: inventoryItems.name })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.orgId, org.id), inArray(inventoryItems.qbItemId, componentQbIds)))
      : [];
    const nameByQb = new Map(compInvRows.map((r) => [r.qbItemId!, r.name]));

    // ── Build the line items ──
    const components: Array<{
      description: string;
      partNumber: string;
      quantity: number;
      unitPrice: number;
      total: number;
      itemId?: string;
      appearsIn?: number;
      appearsInPct?: number;
    }> = [];

    // Always lead with the matched fireplace unit
    components.push({
      description: matchedUnit.topDescription || matchedUnit.inventoryName,
      partNumber: matchedUnit.inventorySku || matchedUnit.inventoryName,
      quantity: 1,
      unitPrice: matchedUnit.unitPrice,
      total: matchedUnit.unitPrice,
      itemId: matchedUnit.qbItemId,
      appearsIn: totalInvoices,
      appearsInPct: 100,
    });

    const sortedTally = [...tally.entries()].sort((a, b) => b[1].appearances.size - a[1].appearances.size);

    for (const [, t] of sortedTally) {
      if (t.appearances.size < minAppearances) break;
      const itemName = (t.qbItemId && nameByQb.get(t.qbItemId)) || t.sampleDescription;
      // Apply user's content filters
      if (!mentionsStone && /stone|veneer|masonry/i.test(itemName + " " + t.sampleDescription)) continue;
      if (!mentionsMantel && /mantel|mantle/i.test(itemName + " " + t.sampleDescription)) continue;
      if (mentionsChasecover && /flashing/i.test(itemName + " " + t.sampleDescription)) continue;

      const avgQty = t.qtys.length > 0 ? t.qtys.reduce((a, b) => a + b, 0) / t.qtys.length : 1;
      let qty = Math.max(1, Math.round(avgQty));
      const price = t.mostRecentPrice || (t.prices[0] ?? 0);
      if (price <= 0) continue;

      // Apply pipe-feet override only to literal straight pipe sections
      if (pipeFeet && isPipeComponent(itemName, t.sampleDescription)) {
        qty = pipeFeet;
      }

      components.push({
        description: t.sampleDescription || itemName,
        partNumber: itemName,
        quantity: qty,
        unitPrice: price,
        total: Number((qty * price).toFixed(2)),
        itemId: t.qbItemId || undefined,
        appearsIn: t.appearances.size,
        appearsInPct: Math.round((t.appearances.size / totalInvoices) * 100),
      });
    }

    // ── Users Charge: 4.22% of materials (exclude labor) ──
    const materialsSubtotal = components
      .filter((c) => !isLaborComponent(c.partNumber, c.description))
      .reduce((s, c) => s + c.total, 0);
    const usersCharge = Number((materialsSubtotal * 0.0422).toFixed(2));
    components.push({
      description: "Users Charge",
      partNumber: "Users Charge",
      quantity: 1,
      unitPrice: usersCharge,
      total: usersCharge,
    });

    const sourceInvoices = recentInvoices.slice(0, 10).map((r) => ({
      docNumber: r.invoiceNumber,
      customer: (r.companyName || [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || ""),
      date: r.issueDate || "",
      total: Number(r.totalAmount ?? 0),
      type: "invoice",
    }));

    const installType = isHorizontal ? "horizontal" : isInsert ? "insert" : "vertical";

    return NextResponse.json({
      lineItems: components,
      matchedProduct: matchedUnit.topDescription || matchedUnit.inventoryName,
      basedOnInvoices: totalInvoices,
      catalogMatch: true,
      usingConsensus: true,
      consensusThresholdPct: Math.round((minAppearances / totalInvoices) * 100),
      installType,
      sourceInvoices,
      notes: `Drafted from ${totalInvoices} past invoice${totalInvoices === 1 ? "" : "s"} that sold ${matchedUnit.topDescription || matchedUnit.inventoryName}. Components shown appear in at least ${Math.round((minAppearances / totalInvoices) * 100)}% of those jobs.${pipeFeet ? ` Pipe quantity overridden to ${pipeFeet} ft as requested.` : ""}`,
      modelUsed: "deterministic/db-aggregation",
      customerName: customerName || undefined,
    });
  } catch (err: any) {
    console.error("estimator ai-generate failed:", err);
    return NextResponse.json({ error: err?.message || "Failed to generate estimate" }, { status: 500 });
  }
}
