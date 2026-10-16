import { requireCrmAdmin, CrmAccessError } from "@/lib/security/crm-access";
import { CommerceError, text } from "@/lib/parts-commerce/domain";
import {
  adminOrderAction,
  emailManualQuote,
  checkoutReady,
  commerceOrg,
} from "@/lib/parts-commerce/server";
import { publishDiscoveredPart } from "@/lib/parts-commerce/scanner";
import { commerceDb } from "@/lib/parts-commerce/store";

const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
  try {
    const actor = await requireCrmAdmin(),
      org = commerceOrg(),
      sql = commerceDb();
    if (actor.orgId !== org)
      throw new CommerceError("Parts service unavailable.", 404);
    if (request.method === "GET") {
      const q = (new URL(request.url).searchParams.get("q") || "").slice(
        0,
        100,
      );
      const [summary] =
        await sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE last_verified_at>now()-interval '24 hours')::int AS verified,count(*) FILTER(WHERE last_error IS NOT NULL)::int AS errors,count(*) FILTER(WHERE override IS NOT NULL)::int AS overrides FROM hearth_parts WHERE org_id=${org}`;
      const parts =
        await sql`SELECT key,sku,catalog->>'name' AS name,offer,override,pilot,duplicate,last_verified_at,last_error FROM hearth_parts WHERE org_id=${org} AND (sku ILIKE ${`%${q}%`} OR catalog->>'name' ILIKE ${`%${q}%`}) ORDER BY last_error NULLS LAST,sku LIMIT 50`;
      const orders =
        await sql`SELECT id,snapshot,payment_state,fulfillment_state,delayed_until,supplier_confirmation,tracking,last_error,created_at FROM hearth_parts_orders WHERE org_id=${org} ORDER BY created_at DESC LIMIT 50`;
      const [scanner] =
        await sql`SELECT * FROM hearth_parts_scanner WHERE org_id=${org}`;
      const discoveries =
        await sql`SELECT url,discovered_at FROM hearth_parts_discovery WHERE org_id=${org} AND reviewed=false LIMIT 25`;
      return Response.json(
        {
          summary,
          parts,
          orders,
          scanner,
          discoveries,
          checkoutReady: checkoutReady(),
          localTaxRatePercent: 9.11,
        },
        { headers },
      );
    }
    if (
      request.headers.get("origin") !== new URL(request.url).origin ||
      !request.headers.get("content-type")?.startsWith("application/json")
    )
      throw new CommerceError("Invalid request origin.", 403);
    const raw = await request.text();
    if (raw.length > 12000) throw new CommerceError("Request too large.", 413);
    const input = JSON.parse(raw);
    if (input.action === "email_quote")
      return Response.json(
        await emailManualQuote(input, org, actor.employeeId),
        { headers },
      );
    if (input.action === "publish_discovery") {
      const departments = [
        "Wood & Coal Stove Parts",
        "Gas Fireplace Parts",
        "Gas Stove Parts",
        "Pellet Stove Parts",
        "Electric Fireplace Parts",
        "Outdoor Fireplace Parts",
      ];
      if (!departments.includes(input.department))
        throw new CommerceError("Choose a parts department.");
      return Response.json(
        await publishDiscoveredPart(org, text(input.url, 2000), {
          brand: text(input.brand, 100),
          department: input.department,
          partType: text(input.partType, 100),
        }),
        { headers },
      );
    }
    if (
      input.action === "override" ||
      input.action === "clear_override" ||
      input.action === "pilot" ||
      input.action === "refresh"
    ) {
      const key = text(input.key, 150);
      if (input.action === "email_quote")
        return Response.json(
          await emailManualQuote(input, org, actor.employeeId),
          { headers },
        );
      if (input.action === "publish_discovery") {
        const departments = [
          "Wood & Coal Stove Parts",
          "Gas Fireplace Parts",
          "Gas Stove Parts",
          "Pellet Stove Parts",
          "Electric Fireplace Parts",
          "Outdoor Fireplace Parts",
        ];
        if (!departments.includes(input.department))
          throw new CommerceError("Choose a parts department.");
        return Response.json(
          await publishDiscoveredPart(org, text(input.url, 2000), {
            brand: text(input.brand, 100),
            department: input.department,
            partType: text(input.partType, 100),
          }),
          { headers },
        );
      }
      if (input.action === "override") {
        // Owner overrides can block/special-order a part, never fabricate stock.
        if (
          !["out_of_stock", "special_order", "unverified"].includes(
            input.status,
          )
        )
          throw new CommerceError("Choose a blocking availability status.");
        const override = {
          status: input.status,
          message: text(input.message, 500),
        };
        await sql`UPDATE hearth_parts SET override=${sql.json(override)} WHERE org_id=${org} AND key=${key}`;
      } else if (input.action === "clear_override")
        await sql`UPDATE hearth_parts SET override=NULL,next_scan_at=now() WHERE org_id=${org} AND key=${key}`;
      else if (input.action === "pilot")
        await sql`UPDATE hearth_parts SET pilot=${input.enabled === true} WHERE org_id=${org} AND key=${key} AND duplicate=false`;
      else
        await sql`UPDATE hearth_parts SET next_scan_at=now(),active_until=now()+interval '24 hours' WHERE org_id=${org} AND key=${key}`;
      await sql`INSERT INTO hearth_parts_history(org_id,key,kind,payload) VALUES(${org},${key},'owner_action',${sql.json({ ...input, actor: actor.employeeId })})`;
      return Response.json({ ok: true }, { headers });
    }
    return Response.json(await adminOrderAction(input, org, actor.employeeId), {
      headers,
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof CommerceError || e instanceof CrmAccessError
            ? e.message
            : "Parts administration unavailable.",
      },
      {
        status:
          e instanceof CommerceError || e instanceof CrmAccessError
            ? e.status
            : 503,
        headers,
      },
    );
  }
}
export const GET = handle;
export const POST = handle;
