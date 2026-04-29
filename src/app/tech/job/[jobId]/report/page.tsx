import Link from "next/link";
import { getJob } from "@/lib/job-store";
import { buildInitialChecklistForm, getChecklistTemplate, inferChecklistTemplateId } from "@/lib/job-checklists";
import AutoPrint from "./AutoPrint";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

function fieldDisplay(value: string | boolean | undefined, type: string) {
  if (type === "pass-fail") {
    if (value === "pass") return { text: "PASS", color: "#16A34A", bg: "rgba(22,163,74,0.1)" };
    if (value === "fail") return { text: "FAIL", color: "#DC2626", bg: "rgba(220,38,38,0.1)" };
    if (value === "na") return { text: "N/A", color: "#9CA3AF", bg: "rgba(156,163,175,0.1)" };
    return { text: "—", color: "#9CA3AF", bg: "transparent" };
  }
  if (type === "rating") {
    const ratings: Record<string, { text: string; color: string; bg: string }> = {
      good: { text: "GOOD", color: "#16A34A", bg: "rgba(22,163,74,0.1)" },
      fair: { text: "FAIR", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
      poor: { text: "POOR", color: "#F97316", bg: "rgba(249,115,22,0.1)" },
      unsafe: { text: "UNSAFE", color: "#DC2626", bg: "rgba(220,38,38,0.1)" },
    };
    return ratings[String(value || "")] || { text: "—", color: "#9CA3AF", bg: "transparent" };
  }
  if (type === "checkbox") {
    return value ? { text: "✓ Completed", color: "#16A34A", bg: "transparent" } : { text: "○ Not completed", color: "#9CA3AF", bg: "transparent" };
  }
  if (type === "multiselect") {
    const items = String(value || "").split("|").map((s) => s.trim()).filter(Boolean);
    return { text: items.length ? items.join(", ") : "—", color: items.length ? "#111827" : "#9CA3AF", bg: "transparent" };
  }
  // radio + select + text + textarea + measurement all show as plain text
  const strVal = String(value || "").trim();
  return { text: strVal || "—", color: strVal ? "#111827" : "#9CA3AF", bg: "transparent" };
}

export default async function TechJobReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { jobId } = await params;
  const resolvedSearchParams = await searchParams;
  const job = await getJob(jobId);

  if (!job) {
    return <div style={{ padding: 32 }}>Job not found.</div>;
  }

  const templateId = job.checklistForm?.templateId || inferChecklistTemplateId({
    jobType: job.jobType,
    fireplaceType: job.fireplaceUnit?.type,
    title: job.title,
  });
  const template = getChecklistTemplate(templateId);
  const form = job.checklistForm || buildInitialChecklistForm(templateId);
  const isInstall = template.isInstall;

  // Get overall condition from form
  const systemCondition = fieldDisplay(form.values["system-condition"], "rating");
  const safeForUse = fieldDisplay(form.values["safe-for-use"], "pass-fail");

  // Determine overall status
  const hasFailures = template.sections.some((s) =>
    s.fields.some((f) => f.type === "pass-fail" && form.values[f.id] === "fail")
  );
  const overallStatus = form.values["safe-for-use"] === "fail"
    ? { text: "FAILED", color: "#DC2626", bg: "rgba(220,38,38,0.08)" }
    : hasFailures
      ? { text: "CONDITIONAL", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" }
      : { text: "PASSED", color: "#16A34A", bg: "rgba(22,163,74,0.08)" };

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: "24px" }}>
      <AutoPrint enabled={resolvedSearchParams.print === "1"} />
      <div style={{ maxWidth: 960, margin: "0 auto", background: "#fff", borderRadius: 16, boxShadow: "0 8px 32px rgba(15,23,42,0.1)", overflow: "hidden" }}>

        {/* ─── Header ─── */}
        <div style={{ padding: "28px 32px", background: "linear-gradient(135deg, #1a1a2e, #16213e)", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#FF6A00", marginBottom: 8 }}>
                Aaron&apos;s Fireplace
              </div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
                {template.reportTitle || template.title}
              </h1>
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "rgba(255,255,255,0.7)" }}>{template.subtitle}</p>
            </div>
            <PrintButton />
          </div>
        </div>

        {/* ─── Status Banner (service reports only) ─── */}
        {!isInstall && (
          <div style={{ padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: overallStatus.bg, borderBottom: `2px solid ${overallStatus.color}30` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.05em", color: overallStatus.color, padding: "6px 16px", borderRadius: 8, border: `2px solid ${overallStatus.color}`, background: "#fff" }}>
                {overallStatus.text}
              </span>
              {form.values["system-condition"] && (
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                  System Condition: <strong style={{ color: systemCondition.color }}>{systemCondition.text}</strong>
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
          </div>
        )}

        <div style={{ padding: "24px 32px" }}>

          {/* ─── Job Info Grid ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
            {[
              ["Customer", job.customerName],
              ["Job #", job.jobNumber],
              ["Date", job.scheduledDate ? new Date(job.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"],
              ["Address", job.propertyAddress],
              ["Technician", form.technicianName || "—"],
              ["Unit", [job.fireplaceUnit?.brand, job.fireplaceUnit?.model].filter(Boolean).join(" ") || "—"],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: "12px 16px", borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af" }}>{label}</div>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 500, color: "#111827" }}>{value || "—"}</div>
              </div>
            ))}
          </div>

          {/* ─── Sections ─── */}
          <div style={{ display: "grid", gap: 20 }}>
            {template.sections.map((section) => {
              // Filter to customer-facing fields only (default true if not set)
              const visibleFields = section.fields.filter((f) => f.customerFacing !== false);
              if (visibleFields.length === 0) return null;

              return (
                <section key={section.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "12px 18px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>{section.title}</h2>
                  </div>
                  <div style={{ padding: "12px 18px" }}>
                    {visibleFields.map((field) => {
                      const val = form.values[field.id];
                      const display = fieldDisplay(val, field.type);

                      return (
                        <div key={field.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                          <span style={{ fontSize: 13, color: "#374151", maxWidth: "65%" }}>
                            {field.label}
                            {field.unit && <span style={{ color: "#9ca3af", marginLeft: 4 }}>({field.unit})</span>}
                          </span>
                          {field.type === "pass-fail" || field.type === "rating" ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: display.bg, color: display.color, border: `1px solid ${display.color}30` }}>
                              {display.text}
                            </span>
                          ) : field.type === "checkbox" ? (
                            <span style={{ fontSize: 13, color: display.color }}>
                              {display.text}
                            </span>
                          ) : field.type === "textarea" ? (
                            <div style={{ fontSize: 13, color: display.color, maxWidth: "60%", textAlign: "right" }}>
                              {display.text}
                            </div>
                          ) : (
                            <span style={{ fontSize: 13, fontWeight: 500, color: display.color }}>
                              {display.text}
                              {field.unit && val ? ` ${field.unit}` : ""}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {/* ─── Recommendations (if deficiencies or recommendations exist) ─── */}
          {(form.values["deficiencies"] || form.values["recommendations"]) && (
            <section style={{ marginTop: 20, border: "2px solid #F59E0B40", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: "rgba(245,158,11,0.06)", borderBottom: "1px solid #F59E0B30" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#92400E" }}>Recommendations</h2>
              </div>
              <div style={{ padding: 18 }}>
                {form.values["deficiencies"] && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#DC2626", marginBottom: 4 }}>Deficiencies Found</div>
                    <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>{String(form.values["deficiencies"])}</div>
                  </div>
                )}
                {form.values["recommendations"] && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#F59E0B", marginBottom: 4 }}>Recommended Actions</div>
                    <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>{String(form.values["recommendations"])}</div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ─── Customer Sign-Off ─── */}
          <section style={{ marginTop: 20, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>Signatures</h2>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af" }}>Customer</div>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 500, color: "#111827" }}>{form.customerName || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af" }}>Technician</div>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 500, color: "#111827" }}>{form.technicianName || "—"}</div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: 6 }}>Customer Signature</div>
                <div style={{ minHeight: 100, borderRadius: 10, border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
                  {form.customerSignature ? (
                    <img src={form.customerSignature} alt="Customer signature" style={{ maxWidth: "100%", maxHeight: 90, objectFit: "contain" }} />
                  ) : (
                    <span style={{ color: "#9ca3af", fontSize: 13 }}>No signature</span>
                  )}
                </div>
                {form.signedAt && (
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                    Signed: {new Date(form.signedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ─── Footer ─── */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#9ca3af" }}>
            <div>
              <strong style={{ color: "#FF6A00" }}>Aaron&apos;s Fireplace</strong> — Generated by HearthOS
              {form.values["next-service-date"] && (
                <span style={{ marginLeft: 12 }}>Next service: <strong style={{ color: "#374151" }}>{String(form.values["next-service-date"])}</strong></span>
              )}
            </div>
            <Link href={`/tech/job/${jobId}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
              Back to Job
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
