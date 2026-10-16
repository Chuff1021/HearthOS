import { runScanBatch } from "../src/lib/parts-commerce/scanner";
async function main() {
  const org = process.env.HEARTHOS_WEBSITE_INBOX_ORG_ID;
  if (!org) throw new Error("Inbox organization missing");
  const budget = Math.max(
    25000,
    Math.min(260000, Number(process.argv[2]) || 45000),
  );
  console.log(await runScanBatch(org, budget));
}
main().catch(() => {
  console.error(
    "Parts scanner needs review; existing verified data was preserved.",
  );
  process.exitCode = 1;
});
