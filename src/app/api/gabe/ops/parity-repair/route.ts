import { NextRequest, NextResponse } from "next/server";
import { listManuals, listManualSections } from "@/lib/manuals";

function getEngineUrl() {
  return process.env.GABE_ENGINE_URL || "http://localhost:4100";
}

function readTag(tags: unknown, prefix: string): string | null {
  if (!Array.isArray(tags)) return null;
  const hit = tags.find((t) => typeof t === "string" && t.startsWith(prefix));
  return typeof hit === "string" ? hit.slice(prefix.length) : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const run = String(body?.run || "dry") === "run";
    const limit = Math.max(1, Math.min(Number(body?.limit || 50), 200));
    const engineUrl = getEngineUrl();

    const manuals = (await listManuals()).filter((m) => m.isActive).slice(0, limit);
    const candidates: any[] = [];

    for (const m of manuals) {
      const sections = await listManualSections(m.id);
      const seed = sections[0];
      const sourcePath = readTag(seed?.tags, "source_path:") || readTag(seed?.tags, "source_file_path:") || null;
      const provenance = readTag(seed?.tags, "parse_provenance:") || null;
      const needsParity = !sourcePath || !provenance || provenance.includes("backfill_v1");
      if (!needsParity) continue;

      const payload = {
        file_path: sourcePath || undefined,
        source_url: m.url || undefined,
        manual_title: `${m.brand} ${m.model} ${m.type}`.trim(),
        manufacturer: m.brand,
        model: m.model,
      };

      let result: any = { dryRun: true };
      if (run) {
        const r = await fetch(`${engineUrl.replace(/\/$/, "")}/ingest/manual`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        result = { status: r.status, ok: r.ok, body: await r.json().catch(() => ({})) };
      }

      candidates.push({
        manualId: m.id,
        brand: m.brand,
        model: m.model,
        type: m.type,
        url: m.url,
        sourcePath,
        provenance,
        payload,
        result,
      });
    }

    return NextResponse.json({ ok: true, run, engineUrl, scanned: manuals.length, repaired: candidates.length, candidates });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "parity repair failed" }, { status: 500 });
  }
}
