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
  return pipeSectionInches(name, desc) !== null;
}

// Returns the section length in inches if the line looks like a STRAIGHT pipe
// section (not an elbow/cap/termination/fitting). Recognizes Travis Elite
// DuraVent ("Elite 48\" DuraVent Chimney"), Simpson DVA ("58DVA-12"), and
// generic "X" pipe" labels. Returns null for accessories.
function pipeSectionInches(name: string | null, desc: string | null): number | null {
  const t = `${name ?? ""} ${desc ?? ""}`.toLowerCase();
  // Hard exclusions for accessories
  if (/elbow|\bcap\b|term|firestop|storm|attic|shield|flashing|adapter|connector|offset|return|45deg|45\s*(?:deg|°)|90\s*(?:deg|°)|starter\s*collar|adjustable|cooling\s*duct|tee\b/.test(t)) return null;
  // Must look like a straight pipe section
  const looksLikePipe = /\bpipe\b|duravent|chimney|elite\b|\bdva\b|\bsv\d+|\b7dt\b/.test(t);
  if (!looksLikePipe) return null;
  // Pull a length: "48\"", "12 inch", "12in", or a "DVA-12"/"7DT-12"/"SV-12" suffix
  const inchMatch = t.match(/\b(\d{1,3})\s*(?:["”'']|inch|in\b)/);
  if (inchMatch) return Number(inchMatch[1]);
  const codeMatch = t.match(/(?:dva|7dt|sv)\s*[-]?\s*(\d{1,3})\b/);
  if (codeMatch) return Number(codeMatch[1]);
  // Looks like a pipe but length unknown — treat it as a section anyway
  return 0;
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

    // When the user specified pipe-feet, replace ALL straight pipe-section
    // components with one line: a 12-inch (1-foot) section × pipeFeet.
    // Pick the 12" variant from the matched unit's historical pipe family;
    // fall back to the smallest section ever used on this unit.
    let pipeSubstitute: { entry: [string, typeof tally extends Map<infer _K, infer V> ? V : never]; inches: number } | null = null;
    if (pipeFeet) {
      const sectionEntries: Array<{ entry: [string, any]; inches: number }> = [];
      for (const e of sortedTally) {
        const itemName = (e[1].qbItemId && nameByQb.get(e[1].qbItemId)) || e[1].sampleDescription;
        const inches = pipeSectionInches(itemName, e[1].sampleDescription);
        if (inches !== null) sectionEntries.push({ entry: e, inches });
      }
      // Prefer 12" exactly, then smallest known length
      pipeSubstitute = sectionEntries.find((s) => s.inches === 12) || null;
      if (!pipeSubstitute) {
        const withSize = sectionEntries.filter((s) => s.inches > 0).sort((a, b) => a.inches - b.inches);
        pipeSubstitute = withSize[0] || null;
      }
      // Last resort: query inventory for "Elite 12" DuraVent Chimney" or any 12"
      // pipe section in the same family the unit uses
      if (!pipeSubstitute) {
        const family = sectionEntries[0]
          ? (() => {
              const itemName = (sectionEntries[0].entry[1].qbItemId && nameByQb.get(sectionEntries[0].entry[1].qbItemId)) || sectionEntries[0].entry[1].sampleDescription;
              if (/elite|duravent/i.test(itemName)) return "elite";
              if (/dva|simpson/i.test(itemName)) return "dva";
              return null;
            })()
          : null;
        if (family) {
          const lookup = await db
            .select({
              qbItemId: inventoryItems.qbItemId,
              name: inventoryItems.name,
              unitPrice: inventoryItems.unitPrice,
            })
            .from(inventoryItems)
            .where(and(
              eq(inventoryItems.orgId, org.id),
              ilike(inventoryItems.name, family === "elite" ? '%elite%12%duravent%' : '%dva-12%'),
            ))
            .limit(1);
          if (lookup[0]) {
            const synthetic: any = {
              qbItemId: lookup[0].qbItemId,
              sampleDescription: lookup[0].name,
              appearances: new Set<string>(["synthetic"]),
              qtys: [1],
              prices: [Number(lookup[0].unitPrice ?? 0)],
              mostRecentPrice: Number(lookup[0].unitPrice ?? 0),
            };
            if (lookup[0].qbItemId) nameByQb.set(lookup[0].qbItemId, lookup[0].name);
            pipeSubstitute = { entry: [`fallback:${lookup[0].qbItemId}`, synthetic], inches: 12 };
          }
        }
      }
    }
    const pipeKeysToSkip = new Set<string>();
    if (pipeSubstitute && pipeFeet) {
      for (const e of sortedTally) {
        const itemName = (e[1].qbItemId && nameByQb.get(e[1].qbItemId)) || e[1].sampleDescription;
        if (pipeSectionInches(itemName, e[1].sampleDescription) !== null) pipeKeysToSkip.add(e[0]);
      }
    }

    for (const [key, t] of sortedTally) {
      if (t.appearances.size < minAppearances) break;
      if (pipeKeysToSkip.has(key)) continue;
      const itemName = (t.qbItemId && nameByQb.get(t.qbItemId)) || t.sampleDescription;
      // Apply user's content filters
      if (!mentionsStone && /stone|veneer|masonry/i.test(itemName + " " + t.sampleDescription)) continue;
      if (!mentionsMantel && /mantel|mantle/i.test(itemName + " " + t.sampleDescription)) continue;
      if (mentionsChasecover && /flashing/i.test(itemName + " " + t.sampleDescription)) continue;

      const avgQty = t.qtys.length > 0 ? t.qtys.reduce((a, b) => a + b, 0) / t.qtys.length : 1;
      const qty = Math.max(1, Math.round(avgQty));
      const price = t.mostRecentPrice || (t.prices[0] ?? 0);
      if (price <= 0) continue;

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

    // Append the substituted 12" pipe line (if pipe-feet was specified)
    if (pipeSubstitute && pipeFeet) {
      const t = pipeSubstitute.entry[1];
      const itemName = (t.qbItemId && nameByQb.get(t.qbItemId)) || t.sampleDescription;
      const price = t.mostRecentPrice || (t.prices[0] ?? 0);
      if (price > 0) {
        components.push({
          description: t.sampleDescription || itemName,
          partNumber: itemName,
          quantity: pipeFeet,
          unitPrice: price,
          total: Number((pipeFeet * price).toFixed(2)),
          itemId: t.qbItemId || undefined,
          appearsIn: t.appearances?.size ?? undefined,
          appearsInPct: t.appearances ? Math.round((t.appearances.size / totalInvoices) * 100) : undefined,
        });
      }
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
      notes: `Drafted from ${totalInvoices} past invoice${totalInvoices === 1 ? "" : "s"} that sold ${matchedUnit.topDescription || matchedUnit.inventoryName}. Components shown appear in at least ${Math.round((minAppearances / totalInvoices) * 100)}% of those jobs.${pipeFeet ? (pipeSubstitute ? ` Pipe replaced with ${pipeFeet} × 12-inch sections.` : ` Pipe-feet (${pipeFeet}) requested but no matching 12-inch section found in history.`) : ""}`,
      modelUsed: "deterministic/db-aggregation",
      customerName: customerName || undefined,
    });
  } catch (err: any) {
    console.error("estimator ai-generate failed:", err);
    return NextResponse.json({ error: err?.message || "Failed to generate estimate" }, { status: 500 });
  }
}
