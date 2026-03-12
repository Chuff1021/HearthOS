async function main() {
  const url = process.env.GABE_SMOKE_URL || "https://hearth-os.vercel.app/api/gabe";
  const payload = {
    messages: [{ role: "user", content: "What size pipe does this use" }],
    jobContext: { fireplace: "FPX 36 Elite NexGen-Hybrid" },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j: any = await r.json();

  const answer = String(j?.answer || "").toLowerCase();
  const backend = String(j?.backend || "");
  const isOperationText = /over-?firing|operation|lighting instructions/.test(answer);
  const manualFilterMissing = j?.manual_id_filter_applied === false || j?.manual_id_filter_applied === null;
  const sectionFilterMissing = j?.section_filter_applied === false || j?.section_filter_applied === null;
  const validatorMismatchAllowed = String(j?.validator_result || "").toLowerCase().includes("mismatch") && j?.answer_status !== "refused";

  const failures: string[] = [];
  if (["manual-guard", "manual-fallback", "manual-fallback-priority"].includes(backend)) failures.push(`bad_backend_path:${backend}`);
  if (isOperationText) failures.push("operation_text_returned_for_pipe_query");
  if (manualFilterMissing) failures.push("manual_id_filter_absent");
  if (sectionFilterMissing) failures.push("section_filter_absent");
  if (validatorMismatchAllowed) failures.push("validator_topic_mismatch_not_refused");

  console.log(JSON.stringify({ ok: failures.length === 0, failures, backend, answer_preview: answer.slice(0, 200), metadata: {
    retrieval_scope_mode: j?.retrieval_scope_mode,
    manual_id_filter_applied: j?.manual_id_filter_applied,
    section_filter_applied: j?.section_filter_applied,
    validator_result: j?.validator_result,
    answer_status: j?.answer_status,
    refusal_reason: j?.refusal_reason,
  }}, null, 2));

  if (failures.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
