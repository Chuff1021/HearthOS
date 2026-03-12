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
    const model = String(body?.model || "").trim();
    if (!model) return NextResponse.json({ error: "model required" }, { status: 400 });

    const manuals = (await listManuals()).filter((m) => `${m.brand} ${m.model}`.toLowerCase().includes(model.toLowerCase()) || m.model.toLowerCase().includes(model.toLowerCase()));
    const installManuals = manuals.filter((m) => /install/i.test(String(m.type || "")));
    const targets = installManuals.length ? installManuals : manuals;
    if (!targets.length) return NextResponse.json({ error: "no matching manuals" }, { status: 404 });

    const engineUrl = getEngineUrl();
    const results: any[] = [];

    for (const m of targets) {
      const sections = await listManualSections(m.id);
      const seed = sections[0];
      const sourcePath = readTag(seed?.tags, "source_path:") || readTag(seed?.tags, "source_file_path:") || null;
      const sourceUrlTag = readTag(seed?.tags, "source_url:");
      const sourceUrl = m.url || sourceUrlTag || null;

      if (!sourcePath && !sourceUrl) {
        results.push({ manualId: m.id, model: m.model, type: m.type, ok: false, reason: "missing_source_path_and_url" });
        continue;
      }

      const payload = {
        file_path: sourcePath || undefined,
        source_url: sourceUrl || undefined,
        manual_title: `${m.brand} ${m.model} ${m.type}`.trim(),
        manufacturer: m.brand,
        model: m.model,
      };

      const res = await fetch(`${engineUrl.replace(/\/$/, "")}/ingest/manual`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      results.push({ manualId: m.id, model: m.model, type: m.type, sourcePath, status: res.status, ok: res.ok, data });
    }

    return NextResponse.json({ ok: true, model, engineUrl, count: results.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "reingest failed" }, { status: 500 });
  }
}
