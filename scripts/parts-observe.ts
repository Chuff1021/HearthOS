import fs from "node:fs/promises";
import path from "node:path";
import { parseSupplierPage } from "../src/lib/parts-commerce/parser";
async function main() {
  const root = process.argv[2];
  if (!root) throw new Error("Supply storefront root");
  const records = [];
  for (const file of (await fs.readdir(path.join(root, "data/parts")))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .slice(0, 15)) {
    records.push(
      ...JSON.parse(
        await fs.readFile(path.join(root, "data/parts", file), "utf8"),
      ),
    );
  }
  const sample = [
    ...records.filter((r) => r.stock > 0).slice(0, 8),
    ...records.filter((r) => r.inStock && r.stock == null).slice(0, 8),
    ...records.filter((r) => !r.inStock).slice(0, 9),
  ];
  let ok = 0,
    failed = 0;
  for (const r of sample) {
    try {
      const response = await fetch(r.productUrl, {
        headers: {
          "User-Agent":
            "AaronsPartsInventory/1.0 (+https://aaronsfireplaceco.com)",
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const offer = parseSupplierPage(await response.text(), r.productUrl, {
        sku: r.sku,
        sourceId: r.productId,
      });
      console.log(
        JSON.stringify({
          sku: r.sku,
          status: offer.status,
          quantity: offer.quantity,
          priceCents: offer.priceCents,
          requiresOptions: offer.requiresOptions,
          availability: offer.availability,
        }),
      );
      ok++;
    } catch (e) {
      failed++;
      console.log(
        JSON.stringify({
          sku: r.sku,
          error: e instanceof Error ? e.message : "failed",
        }),
      );
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.log({ ok, failed });
}
main().catch(() => {
  console.error(
    "Parts command failed. Check configuration and supplier access.",
  );
  process.exitCode = 1;
});
