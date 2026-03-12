function hasTag(tags: any, prefix: string) {
  return Array.isArray(tags) && tags.some((t) => typeof t === "string" && t.startsWith(prefix));
}

async function main() {
  const base = process.env.GABE_WEB_BASE || "https://hearth-os.vercel.app";
  const model = process.env.GABE_PARITY_MODEL || "FPX 36 Elite NexGen-Hybrid";

  const manualsRes = await fetch(`${base}/api/manuals?q=${encodeURIComponent("Elite NexGen")}`);
  const manualsJson: any = await manualsRes.json();
  const manuals = Array.isArray(manualsJson?.manuals) ? manualsJson.manuals : [];
  const install = manuals.find((m: any) => /install/i.test(String(m.type || "")) && String(m.model || "").toLowerCase().includes("36 elite nexgen"));

  let sections: any[] = [];
  if (install?.id) {
    const secRes = await fetch(`${base}/api/manuals/sections?manualId=${encodeURIComponent(install.id)}`);
    const secJson: any = await secRes.json();
    sections = Array.isArray(secJson?.sections) ? secJson.sections : [];
  }

  const parityChecks = {
    registry_record_exists: Boolean(install),
    enriched_chunks_exist: sections.length > 0,
    latest_parse_provenance_exists: sections.some((s: any) => hasTag(s.tags, "parse_provenance:") && !String((s.tags || []).find((t: string) => t.startsWith("parse_provenance:")) || "").includes("backfill_v1")),
    venting_section_tags_exist: sections.some((s: any) => hasTag(s.tags, "section_type:venting") || hasTag(s.tags, "section_type:chimney_pipe")),
    content_kind_tags_exist: sections.some((s: any) => hasTag(s.tags, "content_kind:")),
  };

  const askPayload = {
    messages: [{ role: "user", content: "What size pipe does this use" }],
    jobContext: { fireplace: model },
    selectedManual: install ? { manualId: install.id, manualTitle: `${install.brand} ${install.model} ${install.type}` } : undefined,
  };
  const answerRes = await fetch(`${base}/api/gabe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(askPayload) });
  const answerJson: any = await answerRes.json();

  const reingestProbe = install
    ? await fetch(`${base}/api/gabe/ops/reingest-model`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model }) }).then((r) => r.json()).catch(() => null)
    : null;

  const answer = String(answerJson?.answer || "").toLowerCase();
  const smokeFailures: string[] = [];
  if (!["engine", "orchestrator"].includes(String(answerJson?.backend || ""))) smokeFailures.push("not_engine_backend");
  if (/over-?firing|operation|lighting instructions/.test(answer)) smokeFailures.push("operation_text_for_pipe_query");

  const out = {
    ok: smokeFailures.length === 0,
    model,
    install_manual_found: Boolean(install),
    install_manual: install || null,
    parity_checks: parityChecks,
    reingest_probe: reingestProbe,
    smoke_failures: smokeFailures,
    answer_metadata: {
      backend: answerJson?.backend,
      answer_status: answerJson?.answer_status,
      source_type: answerJson?.source_type,
      validator_result: answerJson?.validator_result,
      run_outcome: answerJson?.run_outcome,
      refusal_reason: answerJson?.refusal_reason,
      resolved_manufacturer: answerJson?.resolved_manufacturer,
      resolved_model: answerJson?.resolved_model,
      retrieval_scope_mode: answerJson?.retrieval_scope_mode,
      manual_id_filter_applied: answerJson?.manual_id_filter_applied,
      section_filter_applied: answerJson?.section_filter_applied,
      evidence_source_mode: answerJson?.evidence_source_mode,
      selected_manual_title: answerJson?.selected_manual_title || answerJson?.manual_title,
      selected_manual_page: answerJson?.selected_manual_page || answerJson?.page_number,
      selected_manual_source_url: answerJson?.selected_manual_source_url || answerJson?.source_url,
    },
    answer_preview: String(answerJson?.answer || "").slice(0, 300),
  };

  console.log(JSON.stringify(out, null, 2));
  if (smokeFailures.length > 0) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
