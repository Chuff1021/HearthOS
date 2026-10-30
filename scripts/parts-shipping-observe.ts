import fs from "node:fs/promises";
import path from "node:path";
import { createSupplierShipping } from "../src/lib/parts-commerce/providers";
async function main() {
  const root = process.argv[2];
  let record;
  for (const file of (await fs.readdir(path.join(root, "data/parts"))).filter(
    (f) => f.endsWith(".json"),
  )) {
    record = JSON.parse(
      await fs.readFile(path.join(root, "data/parts", file), "utf8"),
    ).find((r: { sku: string }) => r.sku === "CC-300");
    if (record) break;
  }
  const address = {
    name: "Aaron's Fireplace Co.",
    email: "",
    phone: "",
    street: "611 E Harrison St",
    street2: "",
    city: "Republic",
    state: "MO",
    zip: "65738",
    country: "US" as const,
  };
  console.log(
    await createSupplierShipping(async (url, init) => {
      const response = await fetch(url, init);
      let title;
      try {
        title = (await response.clone().json()).title;
      } catch {}
      console.log({
        stage: new URL(String(url)).pathname,
        status: response.status,
        title,
        cookies: response.headers.getSetCookie().map((c) => c.split("=", 1)[0]),
      });
      return response;
    })(
      [
        {
          key: `spu:${record.productId}`,
          sku: record.sku,
          name: record.name,
          quantity: 1,
          unitPriceCents: 23055,
          sourceId: record.productId,
          offerHash: "observation",
        },
      ],
      address,
    ),
  );
}
main().catch((e) => {
  console.log({ error: e.message });
  process.exitCode = 1;
});
