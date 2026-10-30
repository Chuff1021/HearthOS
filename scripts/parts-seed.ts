import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { supplierUrl } from "../src/lib/parts-commerce/domain";

// Usage: npx tsx --env-file=.env.production.local scripts/parts-seed.ts /absolute/storefront/root
// Apply scripts/sql/parts-commerce.sql first. Reruns preserve live offers and owner overrides.
async function main() {
  const root = process.argv[2];
  if (
    !root ||
    !process.env.DATABASE_URL ||
    !process.env.HEARTHOS_WEBSITE_INBOX_ORG_ID
  )
    throw new Error(
      "Supply storefront root, DATABASE_URL and inbox organization.",
    );
  const org = process.env.HEARTHOS_WEBSITE_INBOX_ORG_ID,
    sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    let inserted = 0;
    for (const file of (await fs.readdir(path.join(root, "data/parts")))
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      const records = JSON.parse(
        await fs.readFile(path.join(root, "data/parts", file), "utf8"),
      );
      const batch = records
        .filter(
          (r: Record<string, unknown>) => r.productId && r.sku && r.productUrl,
        )
        .map((r: Record<string, unknown>) => {
          supplierUrl(String(r.productUrl));
          return {
            key: `spu:${r.productId}`,
            sku: String(r.sku),
            source_id: String(r.productId),
            url: String(r.productUrl),
            catalog: r,
          };
        });
      await sql`INSERT INTO hearth_parts(org_id,key,sku,source_id,url,catalog,override)
      SELECT ${org},r.key,r.sku,r.source_id,r.url,r.catalog,CASE WHEN r.sku='MA-212400' THEN '{"status":"out_of_stock","message":"4 weeks until ready to ship"}'::jsonb ELSE NULL END
      FROM jsonb_to_recordset(${sql.json(batch as never)}) AS r(key text,sku text,source_id text,url text,catalog jsonb) ON CONFLICT DO NOTHING`;
      inserted += batch.length;
    }

    await sql`UPDATE hearth_parts SET duplicate=true WHERE org_id=${org} AND sku IN (SELECT sku FROM hearth_parts WHERE org_id=${org} GROUP BY sku HAVING count(*)>1)`;
    console.log({ processed: inserted });
  } finally {
    await sql.end();
  }
}
main().catch(() => {
  console.error(
    "Parts command failed. Check configuration and supplier access.",
  );
  process.exitCode = 1;
});
