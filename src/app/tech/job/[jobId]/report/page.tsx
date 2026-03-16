import Link from "next/link";
import { getJob } from "@/lib/job-store";
import { buildInitialChecklistForm, getChecklistTemplate, inferChecklistTemplateId } from "@/lib/job-checklists";
import AutoPrint from "./AutoPrint";

export const dynamic = "force-dynamic";

function valueLabel(value: string | boolean | undefined) {
  if (typeof value === "boolean") return value ? "Completed" : "Not Completed";
  return String(value || "").trim() || "—";
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
    return <div className="p-8">Job not found.</div>;
  }

  const templateId = job.checklistForm?.templateId || inferChecklistTemplateId({
    jobType: job.jobType,
    fireplaceType: job.fireplaceUnit?.type,
    title: job.title,
  });
  const template = getChecklistTemplate(templateId);
  const form = job.checklistForm || buildInitialChecklistForm(templateId);

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: "24px" }}>
      <AutoPrint enabled={resolvedSearchParams.print === "1"} />
      <div style={{ maxWidth: 960, margin: "0 auto", background: "#fff", borderRadius: 20, boxShadow: "0 16px 48px rgba(15,23,42,0.12)", overflow: "hidden" }}>
        <div style={{ padding: 24, background: "linear-gradient(135deg, #fff7ed, #ffedd5)", borderBottom: "1px solid rgba(194,65,12,0.16)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#c2410c" }}>HearthOS Inspection Report</div>
              <h1 style={{ margin: "8px 0 4px", fontSize: 28, lineHeight: 1.1, color: "#111827" }}>{template.title}</h1>
              <p style={{ margin: 0, color: "#6b7280" }}>{template.subtitle}</p>
            </div>
            <button onClick={() => window.print()} style={{ padding: "10px 16px", borderRadius: 12, background: "#c2410c", color: "#fff", border: "none", fontWeight: 700 }}>
              Print / Save PDF
            </button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginBottom: 24 }}>
            {[
              ["Customer", job.customerName],
              ["Job #", job.jobNumber],
              ["Address", job.propertyAddress],
              ["Job Type", job.jobType],
              ["Unit", [job.fireplaceUnit?.brand, job.fireplaceUnit?.model, job.fireplaceUnit?.nickname].filter(Boolean).join(" ") || "—"],
              ["Scheduled", `${job.scheduledDate} ${job.scheduledTimeStart}`],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: 16, borderRadius: 16, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af" }}>{label}</div>
                <div style={{ marginTop: 6, fontSize: 16, color: "#111827" }}>{value || "—"}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 20 }}>
            {template.sections.map((section) => (
              <section key={section.id} style={{ border: "1px solid #e5e7eb", borderRadius: 18, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>{section.title}</h2>
                  {section.description ? <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>{section.description}</p> : null}
                </div>
                <div style={{ padding: 18, display: "grid", gap: 12 }}>
                  {section.fields.map((field) => (
                    <div key={field.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 280px) 1fr", gap: 12, alignItems: "start", borderBottom: "1px solid #f3f4f6", paddingBottom: 12 }}>
                      <div style={{ fontWeight: 600, color: "#374151" }}>{field.label}</div>
                      <div style={{ color: "#111827" }}>{valueLabel(form.values[field.id])}</div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <section style={{ marginTop: 24, border: "1px solid #e5e7eb", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Customer Sign-Off</h2>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af" }}>Customer Name</div>
                <div style={{ marginTop: 6, color: "#111827" }}>{form.customerName || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af" }}>Technician Name</div>
                <div style={{ marginTop: 6, color: "#111827" }}>{form.technicianName || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af" }}>Signed At</div>
                <div style={{ marginTop: 6, color: "#111827" }}>{form.signedAt ? new Date(form.signedAt).toLocaleString() : "—"}</div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af", marginBottom: 8 }}>Signature</div>
                <div style={{ minHeight: 140, borderRadius: 16, border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
                  {form.customerSignature ? (
                    <img src={form.customerSignature} alt="Customer signature" style={{ maxWidth: "100%", maxHeight: 130, objectFit: "contain" }} />
                  ) : (
                    <span style={{ color: "#9ca3af" }}>No signature saved</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", color: "#6b7280", fontSize: 13 }}>
            <span>Generated from HearthOS Tech</span>
            <Link href={`/tech/job/${jobId}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
              Back to Job
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
