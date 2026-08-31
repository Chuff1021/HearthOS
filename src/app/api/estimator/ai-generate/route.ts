import { NextRequest, NextResponse } from "next/server";
import { db, inventoryItems, invoices, invoiceLineItems, customers } from "@/db";
import { and, eq, inArray, sql, desc, ilike, or, isNotNull } from "drizzle-orm";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { authorizeApi } from "@/lib/tenant/api-authorization";

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
  "build", "built", "bid", "quote", "estimate", "estimator", "me",
  "please", "want", "need", "make", "draft", "proposal", "job",
]);

const UNIT_SEARCH_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "fireplace", "fireplaces", "unit", "model", "wood", "gas", "pellet",
  "electric", "burning", "direct", "vent", "nexgen", "gsr", "gsr2",
  "face", "door", "doors", "panel", "panels", "trim", "kit", "black",
  "arched", "metropolitan", "timberline", "universal", "classic",
]);

const GENERIC_UNIT_TOKENS = new Set([
  "fireplace", "fireplaces", "unit", "model", "wood", "gas", "pellet",
  "electric", "burning", "direct", "vent", "nexgen", "gsr", "gsr2",
  "hybrid",
]);

function tokenize(prompt: string): string[] {
  const raw = prompt.toLowerCase().replace(/[-/\\:.,]/g, " ").split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i].replace(/[^a-z0-9]/g, "");
    if (!w || w.length < 2 || STOP_WORDS.has(w)) continue;
    const next = (raw[i + 1] || "").replace(/[^a-z0-9]/g, "");
    // Skip pure-digit measurement tokens like "20 feet" — but only when the
    // NEXT word is a unit-of-measure keyword. Pure-digit MODEL numbers like
    // "864" or "616" must survive (they're commonly typed by themselves).
    if (/^\d+$/.test(w) && /^(feet|foot|ft|inch|in)$/.test(next)) continue;
    out.push(w);
  }
  return out;
}

function unitSearchTokens(prompt: string): string[] {
  const tokens = tokenize(prompt).filter((t) => !UNIT_SEARCH_STOP_WORDS.has(t));
  // If the user only typed generic words, fall back to the broader token set
  // rather than returning nothing. A prompt like "864" or "Twilight" still
  // passes through untouched.
  return tokens.length > 0 ? tokens : tokenize(prompt).filter((t) => !GENERIC_UNIT_TOKENS.has(t));
}

function normalizeSearchText(text: string | null | undefined): string {
  return ` ${(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
}

function tokenInText(text: string, token: string): boolean {
  if (/^\d+$/.test(token)) return text.includes(` ${token} `);
  return text.includes(token);
}

function weightedTokenScore(text: string, tokens: string[]): { matched: number; weight: number; totalWeight: number } {
  let matched = 0;
  let weight = 0;
  let totalWeight = 0;
  for (const token of tokens) {
    const tokenWeight = /^\d+$/.test(token) ? 2.4 : GENERIC_UNIT_TOKENS.has(token) ? 0.35 : 3.0;
    totalWeight += tokenWeight;
    if (tokenInText(text, token)) {
      matched++;
      weight += tokenWeight;
    }
  }
  return { matched, weight, totalWeight };
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
  const looksLikePipe = /\bpipe\b|duravent|chimney|(?:^|[^a-z])dva(?:$|[^a-z])|\bsv\d+|\b7dt\b|\bult\b|\bdsp\b|pellet\s*vent|flex\s*liner/.test(t);
  if (!looksLikePipe) return null;
  // Pull a length: "48\"", "12 inch", "3' Length", "DVA-12", or "46DVA-48".
  const inchMatch = t.match(/\b(\d{1,3})\s*(?:["”'']|inch|in\b)/);
  if (inchMatch) return Number(inchMatch[1]);
  const footMatch = t.match(/\b(\d{1,2})\s*(?:'|ft|feet|foot)\b/);
  if (footMatch) return Number(footMatch[1]) * 12;
  const codeMatch = t.match(/(?:^|[^a-z])(?:dva|7dt|sv|ult|dsp)\s*[-]?\s*(\d{1,3})\b|(?:^|[^a-z])\d{1,2}(?:dva|dt|sv|ult|dsp)\s*[-]?\s*(\d{1,3})\b/);
  if (codeMatch) return Number(codeMatch[1] || codeMatch[2]);
  const shortSkuFootMatch = t.match(/(?:^|[^a-z])(?:dva|7dt|sv|ult|dsp)\s*[-]?\s*(\d)\b/);
  if (shortSkuFootMatch) return Number(shortSkuFootMatch[1]) * 12;
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

function hasUnitSignal(text: string): boolean {
  return /\bfireplace\b|\binsert\b|\bstove\b|\bfirebox\b|\btrv\b|\bgsr2?\b|\bnexgen\b|\bapex\b|\belite\b|\bhybrid\b|\bprobuilder\b|\bhearthroom\b|\bmarquis\b|\btwilight\b|\bdrt\d{3,5}\b|\bdvl\b|\bdeluxe\b/.test(text);
}

function hasAccessorySignal(text: string): boolean {
  return /chase\s*cover|stone|veneer|masonry|mantel|mantle|gasket|bracket|cap\b|firestop|flashing|connector|\bliner\b|flex kit|termination|log\s*set|\blogset\b|door\b|doors\b|remote\b|ignit(?:or|er)|battery\s*pack|cooling\s*duct|attic\s*(?:rad)?\s*shield|starter\s*collar|storm\s*collar|elbow|\btrim\b|\bface\b|\bfan\b|blower|interior\s*panel|panel\b|firescreen|screen\b|tool\s*kit|hearth\s*pad/.test(text);
}

function isExcludedFromUnit(name: string | null, desc: string | null): boolean {
  if (isPipeComponent(name, desc) || isLaborComponent(name, desc) || isTaxLine(name, desc)) return true;
  const n = (name ?? "").toLowerCase();
  const d = (desc ?? "").toLowerCase();
  const combined = `${n} ${d}`;

  // Accessory rows can outrank the base fireplace on short model prompts
  // because they appear on more invoices. Exclude obvious accessory text unless
  // it also carries a strong fireplace-unit signal such as GSR2/TRV/NexGen.
  if (hasAccessorySignal(combined) && !hasUnitSignal(combined)) return true;

  // Feature words such as "fan", "remote", "screen", and "log set" often
  // appear inside full fireplace descriptions. If the canonical item name
  // itself is accessory-like, keep filtering even when the invoice description
  // has a loose unit word nearby.
  if (hasAccessorySignal(n) && !hasUnitSignal(n)) return true;

  return false;
}

// Classify a past invoice's install type from the components it contained.
// Vertical = chimney pipe + flashing + starter collar. Horizontal = flex kit,
// horizontal vent, wall termination. Insert = flex liner / insert kit.
type InstallType = "vertical" | "horizontal" | "insert" | "service" | "unknown";
function classifyInvoice(lineDescriptions: string[]): InstallType {
  const blob = lineDescriptions.map((d) => (d || "").toLowerCase()).join(" | ");
  // Horizontal first — specific signals beat generic ones
  if (/\bflex\s*kit\b|\bhorizontal\b|\bwall\s*term/.test(blob)) return "horizontal";
  if (/77l89|dva-hc\b|horiz\s*vent|rgv\b|rear\s*vent\s*kit/.test(blob)) return "horizontal";
  // Insert: flex liner (different from rigid pipe sections) or insert kit
  if (/\bflex\s*liner\b|\bliner\s*kit\b|\binsert\s*kit\b/.test(blob)) return "insert";
  // Vertical: rigid chimney pipe + flashing/storm/firestop/starter collar
  const hasRigidPipe = /elite\s*\d+\s*["”'']?\s*duravent|duravent\s*chimney|\bdva-\d+\b|\bsv\d+\b|\b7dt-?\d+\b/.test(blob);
  const hasFlashing = /\bflashing\b|\bstorm\s*collar\b|\bstarter\s*collar\b|\battic\s*(?:rad)?\s*shield\b|\bfirestop\b/.test(blob);
  if (hasRigidPipe || hasFlashing) return "vertical";
  // Service-only: nothing structural
  if (/\bservice\s*charge\b|\bclean\s*and\s*inspect\b|\brepair\s*labor\b/.test(blob) && !/install/.test(blob)) return "service";
  return "unknown";
}

// ── Service / repair mode parsing ──────────────────────────────────────────
// Lets the secretary type a chimney-repair bid as a list of line items with
// inline prices, e.g.:
//   "$1500 chimney repair, $300 crown coating, Water seal chimney $159"
// Each item is split on commas/semicolons; the dollar amount can be at the
// start or end of the chunk; remainder becomes the description.

const SERVICE_KEYWORDS = /\b(chimney\s+repair|chimney\s+sweep|crown(?:\s+coat(?:ing)?)?|tuck\s*point|tuckpoint|parge|water\s*seal|smoke\s*(?:shelf|chamber)|relining|reline|chase\s+cover\s+install|inspection|sweep|level\s*[123]|cleaning|repair)\b/i;
const INSTALL_KEYWORDS = /\b(vertical|horizontal|new\s+install|insert|fresh\s+install)\b/i;

function looksLikeServiceMode(prompt: string): boolean {
  const dollarCount = (prompt.match(/\$\d/g) || []).length;
  if (dollarCount >= 2) return true;
  const hasService = SERVICE_KEYWORDS.test(prompt);
  const hasInstall = INSTALL_KEYWORDS.test(prompt);
  return hasService && !hasInstall;
}

function parseServiceLines(prompt: string): Array<{ description: string; unitPrice: number | null }> {
  // Pre-pass: strip thousands commas inside numbers ($1,500 → $1500) and
  // protect decimals (so $159.00 doesn't become two chunks when we split on
  // periods). Then split on commas, semicolons, sentence-end periods, or " then ".
  // Strip thousands commas inside numbers, then protect decimal points with
  // a printable sentinel so we can split on sentence-end periods without
  // breaking up "$159.00" into two chunks.
  const DOT = "~~DOT~~";
  let s = prompt
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    .replace(/(\d)\.(\d{1,2}\b)/g, `$1${DOT}$2`);
  const parts = s
    .split(/[,;.]| then /i)
    .map((p) => p.split(DOT).join(".").trim())
    .filter(Boolean);

  const out: Array<{ description: string; unitPrice: number | null }> = [];
  for (const p of parts) {
    // Leading "$1500 chimney repair" or "1500 chimney repair"
    const lead = p.match(/^\$?(\d{2,6}(?:\.\d{1,2})?)\s+(.+?)\s*$/);
    // Trailing "Water seal chimney $159"
    const trail = p.match(/^\s*(.+?)\s+\$?(\d{2,6}(?:\.\d{1,2})?)\s*$/);
    let price: number | null = null;
    let desc = p;
    if (lead) {
      price = Number(lead[1]);
      desc = lead[2].trim();
    } else if (trail) {
      price = Number(trail[2]);
      desc = trail[1].trim();
    }
    if (!desc) continue;
    // Strip stray leading/trailing punctuation
    const cleaned = desc.replace(/^[\s.\-:]+|[\s.\-:]+$/g, "").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    out.push({ description: cleaned.charAt(0).toUpperCase() + cleaned.slice(1), unitPrice: price });
  }
  return out;
}

// Recognize labor-style line descriptions that should bill under a generic
// "Labor" QB item with the user's text preserved as the line description.
function isLaborDescription(desc: string): boolean {
  const t = desc.toLowerCase();
  return /\b(chimney\s*repair|tuck\s*point|tuckpoint|rebuild|repair|labor|smoke\s*chamber\s*repair|parge|reline|relining|service\s*charge)\b/.test(t)
    && !/\bcrown\s*coat|\bcrown\s*coating\b|\bwater\s*seal/.test(t); // crown coat / water seal are products, not labor
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
  const denied = await authorizeApi("inventory:read");
  if (denied) return denied;
  return NextResponse.json({ ok: true, route: "estimator/ai-generate", info: "POST {prompt, customerName} to generate" });
}

export async function POST(request: NextRequest) {
  const denied = await authorizeApi("financials:write");
  if (denied) return denied;

  try {
    const body = await request.json();
    const prompt: string = (body.prompt || "").toString();
    const customerName: string = (body.customerName || "").toString();
    if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

    const org = await getOrCreateDefaultOrg();

    // ── Service / repair mode (chimney repair bids with inline prices) ──
    // Triggers when the prompt has multiple $ amounts, OR a service keyword
    // (chimney repair / crown coat / tuck point / water seal / sweep / etc)
    // without install signals. Bypasses fireplace-unit matching entirely.
    if (looksLikeServiceMode(prompt)) {
      const items = parseServiceLines(prompt);
      if (items.length === 0) {
        return NextResponse.json({
          error: "Couldn't parse any line items. Try '$1500 chimney repair, $300 crown coating'",
          lineItems: [],
        }, { status: 400 });
      }

      // Resolve each line to a QB item id + reasonable price:
      //   1. Labor-style descriptions ("chimney repair", "tuck point", etc) →
      //      the org's Labor item. The user wants these to bill as labor with
      //      the typed text preserved as the LINE description.
      //   2. Otherwise look up an exact-ish product name match in inventory
      //      ("Crown Coat" → qb_item_id for the Crown Coat product item;
      //      "water seal" → the Water Seal item).
      //   3. Otherwise fall back to the most-frequent qb_item_id seen on past
      //      invoices for a description with overlapping tokens.
      //   4. Price always prefers what the user typed; otherwise the
      //      most-recent past-invoice price for the matched item; otherwise
      //      the inventory unit price; otherwise 0.

      // One-time look up the Labor item id (for labor-style lines)
      const laborRows = await db
        .select({ qbItemId: inventoryItems.qbItemId, name: inventoryItems.name })
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.orgId, org.id),
          ilike(inventoryItems.name, "labor"),
          isNotNull(inventoryItems.qbItemId),
        ))
        .limit(1);
      const laborItem = laborRows[0] || null;

      type Resolved = {
        description: string;
        partNumber: string;
        quantity: number;
        unitPrice: number;
        total: number;
        itemId?: string;
        itemName?: string;
      };

      const resolved: Resolved[] = [];
      for (const it of items) {
        let qbItemId: string | undefined;
        let qbItemName: string | undefined;
        let inferredPrice = 0;

        const tokens = it.description.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);

        // Step 1: labor-style → Labor item
        if (isLaborDescription(it.description) && laborItem) {
          qbItemId = laborItem.qbItemId!;
          qbItemName = laborItem.name;
        } else if (tokens.length > 0) {
          // Step 2: inventory exact-ish name match
          // Build an ILIKE pattern that requires all tokens in order (loose).
          const namePattern = `%${tokens.join("%")}%`;
          const invHits = await db
            .select({
              qbItemId: inventoryItems.qbItemId,
              name: inventoryItems.name,
              unitPrice: inventoryItems.unitPrice,
            })
            .from(inventoryItems)
            .where(and(
              eq(inventoryItems.orgId, org.id),
              ilike(inventoryItems.name, namePattern),
              isNotNull(inventoryItems.qbItemId),
            ))
            .orderBy(sql`length(${inventoryItems.name}) asc`)
            .limit(5);

          // Prefer the item whose name length is closest to the description
          // (avoids matching "Crown Coat 5-gal Bucket" when user said "Crown Coat")
          if (invHits.length > 0) {
            qbItemId = invHits[0].qbItemId!;
            qbItemName = invHits[0].name;
            const ip = invHits[0].unitPrice;
            if (ip != null && Number(ip) > 0) inferredPrice = Number(ip);
          }
        }

        // Step 3: past-invoice fallback (also gives us a recent price)
        if (tokens.length > 0) {
          const orFilters = tokens.map((t) => ilike(invoiceLineItems.description, `%${t}%`));
          const rows = await db
            .select({
              qbItemId: invoiceLineItems.qbItemId,
              description: invoiceLineItems.description,
              unitPrice: invoiceLineItems.unitPrice,
              issueDate: invoices.issueDate,
            })
            .from(invoiceLineItems)
            .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
            .where(and(
              eq(invoices.orgId, org.id),
              sql`${invoiceLineItems.unitPrice}::numeric > 0`,
              or(...orFilters),
            ))
            .orderBy(desc(invoices.issueDate))
            .limit(40);

          // Score by token overlap, prefer the most-frequent qb_item_id
          let bestPrice = 0;
          let bestScore = 0;
          const idTally = new Map<string, { uses: number; recentPrice: number }>();
          for (const r of rows) {
            const desc = (r.description || "").toLowerCase();
            let score = 0;
            for (const t of tokens) if (desc.includes(t)) score++;
            if (score === 0) continue;
            if (score > bestScore) { bestScore = score; bestPrice = Number(r.unitPrice ?? 0); }
            if (r.qbItemId) {
              const cur = idTally.get(r.qbItemId) || { uses: 0, recentPrice: 0 };
              cur.uses++;
              if (cur.recentPrice === 0) cur.recentPrice = Number(r.unitPrice ?? 0);
              idTally.set(r.qbItemId, cur);
            }
          }
          if (inferredPrice === 0 && bestPrice > 0) inferredPrice = bestPrice;
          // Only fall back to past-invoice qb if we didn't already resolve via
          // labor or inventory name match
          if (!qbItemId && idTally.size > 0) {
            const ranked = [...idTally.entries()].sort((a, b) => b[1].uses - a[1].uses);
            qbItemId = ranked[0][0];
            // Look up the canonical name for display
            const inv = await db
              .select({ name: inventoryItems.name })
              .from(inventoryItems)
              .where(and(eq(inventoryItems.orgId, org.id), eq(inventoryItems.qbItemId, qbItemId)))
              .limit(1);
            qbItemName = inv[0]?.name;
          }
        }

        const finalPrice = it.unitPrice ?? inferredPrice ?? 0;
        resolved.push({
          description: it.description,
          partNumber: qbItemName || it.description,
          quantity: 1,
          unitPrice: finalPrice,
          total: finalPrice,
          itemId: qbItemId,
          itemName: qbItemName,
        });
      }

      const lineItems = resolved;

      const subtotal = lineItems.reduce((s, l) => s + l.total, 0);
      const usersCharge = Number((subtotal * 0.0422).toFixed(2));
      lineItems.push({
        description: "Users Charge",
        partNumber: "Users Charge",
        quantity: 1,
        unitPrice: usersCharge,
        total: usersCharge,
      });

      const inferred = items.filter((i) => i.unitPrice != null && i.unitPrice > 0).length;
      const empty = items.length - inferred;
      return NextResponse.json({
        lineItems,
        matchedProduct: "Chimney Service Bid",
        basedOnInvoices: 0,
        catalogMatch: false,
        usingConsensus: false,
        installType: "service",
        sourceInvoices: [],
        notes: `Built from ${items.length} line item${items.length === 1 ? "" : "s"} you specified.${empty > 0 ? ` ${empty} item${empty === 1 ? "" : "s"} had no price and no past-invoice match — fill in manually.` : ""}`,
        modelUsed: "user-input/service-mode",
        customerName: customerName || undefined,
      });
    }

    // ── Parse prompt ──
    const pipeFeetMatch = prompt.match(/(\d+)\s*(?:ft|feet|foot|')/i);
    const pipeFeet = pipeFeetMatch ? Number(pipeFeetMatch[1]) : null;
    const isHorizontal = /horizontal/i.test(prompt);
    const isInsert = /\binsert\b|\bliner\b/i.test(prompt);
    const mentionsStone = /\bstone\b|\bveneer\b|\bmasonry\b/.test(prompt.toLowerCase());
    const mentionsMantel = /\bmantel\b|\bmantle\b/.test(prompt.toLowerCase());
    const mentionsChasecover = /chase\s*cover/i.test(prompt);
    const tokens = tokenize(prompt);
    const coreTokens = unitSearchTokens(prompt);

    if (coreTokens.length === 0) {
      return NextResponse.json({ error: "Couldn't parse a model from the prompt. Try '42 Apex vertical install'." }, { status: 400 });
    }

    // ── Find candidate fireplace units ──
    // Match against (a) inventory_items.name and (b) any past invoice line
    // description for that item. The friendly model name ("42 Apex
    // NexGen-Hybrid") lives in the line description, not the canonical name.
    const tokenLikes = coreTokens.map((t) => `%${t}%`);
    const invoiceOrFilters = tokenLikes.map((p) => ilike(invoiceLineItems.description, p));
    const inventoryOrFilters = coreTokens.flatMap((t) => [
      ilike(inventoryItems.name, `%${t}%`),
      ilike(inventoryItems.sku, `%${t}%`),
      ilike(inventoryItems.description, `%${t}%`),
    ]);

    const liDescMatches = await db
      .select({
        qbItemId: invoiceLineItems.qbItemId,
        description: invoiceLineItems.description,
        uses: sql<number>`count(*)::int`,
        mostRecentPrice: sql<number>`max(${invoiceLineItems.unitPrice})`,
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
      .where(and(
        eq(invoices.orgId, org.id),
        sql`${invoiceLineItems.qbItemId} is not null`,
        or(...invoiceOrFilters),
      ))
      .groupBy(invoiceLineItems.qbItemId, invoiceLineItems.description)
      .orderBy(sql`count(*) desc`)
      .limit(1000);

    const liAllTokenMatches = coreTokens.length > 1
      ? await db
          .select({
            qbItemId: invoiceLineItems.qbItemId,
            description: invoiceLineItems.description,
            uses: sql<number>`count(*)::int`,
            mostRecentPrice: sql<number>`max(${invoiceLineItems.unitPrice})`,
          })
          .from(invoiceLineItems)
          .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
          .where(and(
            eq(invoices.orgId, org.id),
            sql`${invoiceLineItems.qbItemId} is not null`,
            ...tokenLikes.map((p) => ilike(invoiceLineItems.description, p)),
          ))
          .groupBy(invoiceLineItems.qbItemId, invoiceLineItems.description)
          .orderBy(sql`count(*) desc`)
          .limit(200)
      : [];

    const inventoryMatches = inventoryOrFilters.length > 0
      ? await db
          .select({
            qbItemId: inventoryItems.qbItemId,
            name: inventoryItems.name,
            sku: inventoryItems.sku,
            description: inventoryItems.description,
            unitPrice: inventoryItems.unitPrice,
          })
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.orgId, org.id),
            isNotNull(inventoryItems.qbItemId),
            or(...inventoryOrFilters),
          ))
          .limit(400)
      : [];

    // Score by token completeness first, history second. This prevents common
    // loose hits like "42 wood fireplace" from beating a rarer exact model
    // such as "42 Apex" or "36 Elite".
    const scoreByQb = new Map<string, { score: number; uses: number; topDesc: string; recentPrice: number }>();
    for (const r of [...liDescMatches, ...liAllTokenMatches]) {
      if (!r.qbItemId) continue;
      const desc = normalizeSearchText(r.description);
      const matchedScore = weightedTokenScore(desc, coreTokens);
      const matched = matchedScore.matched;
      if (matched === 0) continue;
      const cur = scoreByQb.get(r.qbItemId);
      const completeness = matchedScore.totalWeight > 0 ? matchedScore.weight / matchedScore.totalWeight : 0;
      const fullMatchBonus = matched === coreTokens.length ? 35 : 0;
      const score = Math.pow(completeness, 3) * 100 + fullMatchBonus + Math.log2(1 + Number(r.uses)) * 0.5;
      if (!cur || score > cur.score) {
        scoreByQb.set(r.qbItemId, {
          score,
          uses: Number(r.uses),
          topDesc: r.description || "",
          recentPrice: Number(r.mostRecentPrice ?? 0),
        });
      }
    }

    for (const r of inventoryMatches) {
      if (!r.qbItemId) continue;
      const text = normalizeSearchText(`${r.name} ${r.sku || ""} ${r.description || ""}`);
      const matchedScore = weightedTokenScore(text, coreTokens);
      if (matchedScore.matched === 0) continue;
      const completeness = matchedScore.totalWeight > 0 ? matchedScore.weight / matchedScore.totalWeight : 0;
      const cur = scoreByQb.get(r.qbItemId);
      const hasInvoiceHistory = !!cur;
      const fullMatchBonus = matchedScore.matched === coreTokens.length ? (hasInvoiceHistory ? 45 : 10) : 0;
      const score = Math.pow(completeness, 3) * (hasInvoiceHistory ? 100 : 55) + fullMatchBonus + (hasInvoiceHistory ? 5 : 0);
      if (!cur || score > cur.score) {
        scoreByQb.set(r.qbItemId, {
          score,
          uses: cur?.uses ?? 0,
          topDesc: r.description || r.name,
          recentPrice: Number(r.unitPrice ?? cur?.recentPrice ?? 0),
        });
      }
    }

    if (scoreByQb.size === 0) {
      return NextResponse.json({
        error: `No past invoices match "${prompt}". Try a model name like '42 Apex' or '36 Elite'.`,
        lineItems: [],
      }, { status: 404 });
    }

    // Pull the inventory rows for the candidate qb ids — apply price + name filters
    const candidateUnitIds = [...scoreByQb.keys()];
    const invRows = await db
      .select({
        qbItemId: inventoryItems.qbItemId,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
        unitPrice: inventoryItems.unitPrice,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, org.id), inArray(inventoryItems.qbItemId, candidateUnitIds)));

    const candidates: Candidate[] = [];
    const seenInventoryIds = new Set<string>();
    for (const r of invRows) {
      if (!r.qbItemId) continue;
      seenInventoryIds.add(r.qbItemId);
      const meta = scoreByQb.get(r.qbItemId);
      if (!meta) continue;
      const price = r.unitPrice != null ? Number(r.unitPrice) : meta.recentPrice;
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

    // Legacy QB items can exist on old invoices without an inventory_items row.
    // Keep them as candidates using the invoice description and recent invoice
    // price so sparse-but-important models are not silently dropped.
    for (const [qbItemId, meta] of scoreByQb) {
      if (seenInventoryIds.has(qbItemId)) continue;
      const price = meta.recentPrice || 0;
      if (isExcludedFromUnit(meta.topDesc, meta.topDesc)) continue;
      if (price > 0 && price < 800) continue;
      candidates.push({
        qbItemId,
        inventoryName: meta.topDesc,
        inventorySku: null,
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

    // ── Pull last 80 invoices that included this unit (we'll filter by install
    //    type below, then keep the 30 most-recent matching ones) ──
    const candidateInvoices = await db
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
      .limit(80);

    const candidateIds = candidateInvoices.map((r) => r.invoiceId);
    if (candidateIds.length === 0) {
      return NextResponse.json({
        error: `Matched ${matchedUnit.inventoryName} but no invoice history to draft from.`,
        lineItems: [],
      }, { status: 404 });
    }

    // ── Pull all lines from those invoices ──
    const allCandidateLines = await db
      .select({
        invoiceId: invoiceLineItems.invoiceId,
        qbItemId: invoiceLineItems.qbItemId,
        description: invoiceLineItems.description,
        quantity: invoiceLineItems.quantity,
        unitPrice: invoiceLineItems.unitPrice,
        total: invoiceLineItems.total,
      })
      .from(invoiceLineItems)
      .where(inArray(invoiceLineItems.invoiceId, candidateIds))
      .orderBy(desc(invoiceLineItems.invoiceId));

    // ── Classify each candidate invoice by install type ──
    const linesByInvoice = new Map<string, typeof allCandidateLines>();
    for (const l of allCandidateLines) {
      const arr = linesByInvoice.get(l.invoiceId) || [];
      arr.push(l);
      linesByInvoice.set(l.invoiceId, arr);
    }
    const invoiceTypeById = new Map<string, InstallType>();
    const typeCounts: Record<InstallType, number> = { vertical: 0, horizontal: 0, insert: 0, service: 0, unknown: 0 };
    for (const id of candidateIds) {
      const descs = (linesByInvoice.get(id) || []).map((l) => l.description || "");
      const t = classifyInvoice(descs);
      invoiceTypeById.set(id, t);
      typeCounts[t]++;
    }

    // ── Filter to invoices matching the requested install type ──
    // Prompt-derived target: "horizontal", "insert", or "vertical" (default).
    const targetType: InstallType = isHorizontal ? "horizontal" : isInsert ? "insert" : "vertical";
    const matchingIds = candidateIds.filter((id) => {
      const t = invoiceTypeById.get(id);
      // Always allow exact matches; allow "unknown" so we don't lose pricing
      // data on invoices the classifier couldn't categorize confidently.
      return t === targetType || t === "unknown";
    });
    // If nothing matched, fall back to all (don't return zero results)
    const finalIds = matchingIds.length > 0 ? matchingIds.slice(0, 30) : candidateIds.slice(0, 30);
    const finalIdsSet = new Set(finalIds);
    const recentInvoices = candidateInvoices.filter((r) => finalIdsSet.has(r.invoiceId));
    const invoiceIds = finalIds;
    const allLines = allCandidateLines.filter((l) => finalIdsSet.has(l.invoiceId));
    const filteredOut = candidateIds.length - matchingIds.length;

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
    const minAppearances = totalInvoices <= 2 ? 1 : Math.max(2, Math.ceil(totalInvoices * 0.4));

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
    // components with one estimate line based on the historical pipe family.
    // We price the estimate by the foot so the final invoice can be updated to
    // exact section counts once the actual run is installed.
    let pipeSubstitute: { entry: [string, typeof tally extends Map<infer _K, infer V> ? V : never]; inches: number } | null = null;
    if (pipeFeet) {
      const sectionEntries: Array<{ entry: [string, any]; inches: number }> = [];
      for (const e of sortedTally) {
        const itemName = (e[1].qbItemId && nameByQb.get(e[1].qbItemId)) || e[1].sampleDescription;
        const inches = pipeSectionInches(itemName, e[1].sampleDescription);
        if (inches !== null) sectionEntries.push({ entry: e, inches });
      }
      // Prefer the most common known-length pipe section for this model. When
      // frequency ties, prefer the longer section because estimators normally
      // buy longer straight runs and cut/offset with fittings.
      const withSize = sectionEntries
        .filter((s) => s.inches > 0)
        .sort((a, b) => b.entry[1].appearances.size - a.entry[1].appearances.size || b.inches - a.inches);
      pipeSubstitute = withSize[0] || sectionEntries[0] || null;
      // Last resort: query inventory for a common 48" section in the same
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
              ilike(inventoryItems.name, family === "elite" ? '%48%duravent%' : '%dva-48%'),
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
            pipeSubstitute = { entry: [`fallback:${lookup[0].qbItemId}`, synthetic], inches: 48 };
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
      if (!mentionsChasecover && /chase\s*cover/i.test(itemName + " " + t.sampleDescription)) continue;
      if (mentionsChasecover && /flashing/i.test(itemName + " " + t.sampleDescription)) continue;

      const avgQty = t.qtys.length > 0 ? t.qtys.reduce((a, b) => a + b, 0) / t.qtys.length : 1;
      const qty = Math.max(1, Math.round(avgQty));
      const price = t.mostRecentPrice || (t.prices[0] ?? 0);
      if (price <= 0) continue;
      const componentText = `${itemName} ${t.sampleDescription}`.toLowerCase();
      if (!isPipeComponent(itemName, t.sampleDescription) && !isLaborComponent(itemName, t.sampleDescription) && hasUnitSignal(componentText) && price >= 800) continue;

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

    // Append the substituted pipe line (if pipe-feet was specified). Keep the
    // historical pipe item, but convert the section price into a per-foot bid.
    if (pipeSubstitute && pipeFeet) {
      const t = pipeSubstitute.entry[1];
      const itemName = (t.qbItemId && nameByQb.get(t.qbItemId)) || t.sampleDescription;
      const price = t.mostRecentPrice || (t.prices[0] ?? 0);
      const sectionFeet = pipeSubstitute.inches > 0 ? pipeSubstitute.inches / 12 : 1;
      const pipeQty = pipeFeet;
      const perFootPrice = Number((price / sectionFeet).toFixed(2));
      if (price > 0) {
        components.push({
          description: `${t.sampleDescription || itemName} (estimated per foot)`,
          partNumber: itemName,
          quantity: pipeQty,
          unitPrice: perFootPrice,
          total: Number((pipeQty * perFootPrice).toFixed(2)),
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

    const installType = targetType;
    const usedFallback = matchingIds.length === 0;

    return NextResponse.json({
      lineItems: components,
      matchedProduct: matchedUnit.topDescription || matchedUnit.inventoryName,
      basedOnInvoices: totalInvoices,
      catalogMatch: true,
      usingConsensus: true,
      consensusThresholdPct: Math.round((minAppearances / totalInvoices) * 100),
      installType,
      installTypeFiltered: !usedFallback,
      historicalTypeCounts: typeCounts,
      filteredOut,
      sourceInvoices,
      notes: [
        `Drafted from ${totalInvoices} past ${installType} invoice${totalInvoices === 1 ? "" : "s"} that sold ${matchedUnit.topDescription || matchedUnit.inventoryName}.`,
        usedFallback
          ? `(No clear ${installType} jobs in history — falling back to all install types.)`
          : `${filteredOut} of ${candidateIds.length} non-${installType} jobs filtered out.`,
        `Components shown appear in at least ${Math.round((minAppearances / totalInvoices) * 100)}% of those jobs.`,
        pipeFeet
          ? (pipeSubstitute
            ? `Pipe estimated as ${pipeFeet} one-foot units using the historical ${pipeSubstitute.inches || 12}-inch pipe item; update final invoice to actual section counts after install.`
            : `Pipe-feet (${pipeFeet}) requested but no matching straight pipe section found in history.`)
          : "",
      ].filter(Boolean).join(" "),
      modelUsed: "deterministic/db-aggregation",
      customerName: customerName || undefined,
    });
  } catch (err: any) {
    console.error("estimator ai-generate failed:", err);
    return NextResponse.json({ error: err?.message || "Failed to generate estimate" }, { status: 500 });
  }
}
