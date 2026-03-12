import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { upsertDiscoveredSource } from "../src/swarm/sourceGovernance";
import { enqueueSourceJob } from "../src/swarm/sourceGovernanceHardening";

const seeds = [
  { source_type: "manufacturer_manual", manufacturer: "Travis", url: "https://www.travisindustries.com/owner-resources" },
  { source_type: "manufacturer_manual", manufacturer: "HHT", url: "https://downloads.hearthnhome.com" },
  { source_type: "standards_document", publisher: "NFPA", url: "https://www.nfpa.org/codes-and-standards" },
  { source_type: "code_document", publisher: "ICC", url: "https://codes.iccsafe.org" },
  { source_type: "training_reference", publisher: "CSIA", url: "https://www.csia.org" },
];

async function fetchHtml(url: string) {
  const r = await fetch(url, { redirect: "follow" });
  const text = await r.text();
  return { status: r.status, text };
}

function extractPdfLinks(html: string, base: string) {
  const links = Array.from(html.matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)).map((m) => m[1]);
  return Array.from(new Set(links.map((l) => l.startsWith("http") ? l : new URL(l, base).toString())));
}

function checksum(v: string) { return createHash("sha256").update(v).digest("hex"); }

async function main() {
  const discovered: any[] = [];

  for (const seed of seeds) {
    try {
      const { text } = await fetchHtml(seed.url);
      const links = extractPdfLinks(text, seed.url);
      for (const link of links.slice(0, 120)) {
        const title = decodeURIComponent(link.split("/").pop() || "document.pdf");
        const chk = checksum(link);
        const rec = await upsertDiscoveredSource({
          source_type: seed.source_type,
          manufacturer: seed.manufacturer,
          publisher: seed.publisher,
          title,
          source_url: link,
          checksum: chk,
          ingest_status: "discovered",
          confidence: 0.82,
          document_kind: "pdf",
        });
        if (rec?.source_id) {
          await enqueueSourceJob({ source_id: rec.source_id, job_type: "download_parse", payload: { source_url: link } });
        }
        discovered.push({ ...seed, link, rec });
      }
    } catch (e: any) {
      discovered.push({ ...seed, error: String(e?.message || e) });
    }
  }

  const out = "/tmp/gabe_source_discovery_report.json";
  await writeFile(out, JSON.stringify({ generated_at: new Date().toISOString(), discovered_count: discovered.length, discovered }, null, 2));
  console.log(JSON.stringify({ ok: true, out, discovered_count: discovered.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
