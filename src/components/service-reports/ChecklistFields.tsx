"use client";

import { Check, AlertTriangle, Minus, EyeOff } from "lucide-react";
import { outcomeOptions, type Field, type Template } from "@/lib/service-reports/templates";
import { validateReport, type ReportData } from "@/lib/service-reports/domain";
import { reportInput } from "./ServiceReportHistory";

const conditions = [
  { value: "S", label: "OK", title: "Satisfactory", Icon: Check, color: "#167348" },
  { value: "D", label: "Issue", title: "Defect", Icon: AlertTriangle, color: "#bd3b25" },
  { value: "NA", label: "N/A", title: "Not applicable", Icon: Minus, color: "#5e6674" },
  { value: "NI", label: "Not checked", title: "Not inspected", Icon: EyeOff, color: "#98630d" },
];
const automatic = new Set(["companyName", "companyContact", "customerName", "customerContact", "jobNumber", "technicianName"]);

export default function ChecklistFields({ template, data, disabled, onChange }: {
  template: Template; data: ReportData; disabled: boolean; onChange: (id: string, value: string) => void;
}) {
  const needed = new Set(validateReport(data, []).flatMap(error => [...error.matchAll(/\(([A-Za-z0-9_]+)\)/g)].map(match => match[1])));
  const answer = (id: string) => data.answers[id] || "";
  // Keep conditionally required details visible even after they have been answered.
  if (["Limited", "Withheld"].includes(answer("testing"))) needed.add("testingReason");
  if (["cleaningPreparation", "shutdownPreparation", "electricalPreparation"].some(id => answer(id) === "Not performed")) needed.add("cleaningPreparationReason");
  for (const [choice, detail] of [["applianceType", "applianceOther"], ["venting", "ventingOther"], ["ignition", "ignitionOther"], ["chimneyType", "chimneyOther"]]) if (answer(choice) === "Other") needed.add(detail);
  if (["Unavailable", "Declined"].includes(answer("acknowledgmentStatus"))) needed.add("acknowledgmentDelivery");
  if (answer("acknowledgmentStatus") === "Receipt recorded") ["customerRepresentative", "acknowledgmentDateTime"].forEach(id => needed.add(id));
  if (answer("outcome") === outcomeOptions[2]) needed.add("customerNotifiedTime");
  if (data.fuel === "wood") {
    for (let n = 1; n <= Math.min(Number(answer("totalFlues")) || 0, 3); n++) {
      [`flue${n}_id`, `flue${n}_appliance`].forEach(id => needed.add(id));
      if (answer("scan") === "Performed") [`scan${n}_flueId`, `scan${n}_coverage`, `scan${n}_files`].forEach(id => needed.add(id));
    }
    if (answer("scan") === "Performed") ["scanDevice", "scanOperator"].forEach(id => needed.add(id));
    if (answer("scan") === "Not performed") needed.add("scanReason");
    if (answer("operationCheck") === "Not performed") needed.add("operationConditions");
    if (Number(answer("totalFlues")) > 3) { needed.add("additionalFlues"); if (answer("scan") === "Performed") needed.add("additionalScans"); }
    if (answer("scopeStatus").startsWith("Incomplete")) ["accessLimits", "furtherInvestigation"].forEach(id => needed.add(id));
  }
  for (const item of template.sections.flatMap(section => section.fields)) {
    if (item.id.startsWith("access_") && answer(item.id) === "NI") needed.add(`${item.id}_notes`);
    if (item.id.endsWith("_initial")) {
      const prefix = item.id.replace(/_initial$/, "");
      if (answer(item.id) || answer(`${prefix}_final`)) ["units", "criterion"].forEach(suffix => needed.add(`${prefix}_${suffix}`));
    }
    if (item.id.startsWith("measure_") && item.id.endsWith("_actual") && answer(item.id)) needed.add(item.id.replace(/_actual$/, "_required"));
  }
  function field(field: Field) {
    const value = data.answers[field.id] || "";
    if (automatic.has(field.id)) return null;
    return <label key={field.id} className={`block min-w-0 text-sm ${field.type === "textarea" ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block">{field.label}{field.required && <span aria-label="required"> *</span>}</span>
      {field.type === "select" ? <select className={reportInput} value={value} onChange={e => onChange(field.id, e.target.value)} aria-required={field.required}>
        <option value="">Select</option>
        {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
      </select> : field.type === "textarea" ? <textarea className={`${reportInput} min-h-20`} maxLength={8000} value={value} onChange={e => onChange(field.id, e.target.value)} aria-required={field.required} />
        : <input type={field.id === "serviceDate" ? "date" : "text"} className={reportInput} maxLength={8000} value={value} onChange={e => onChange(field.id, e.target.value)} aria-required={field.required} />}
      {["workPending", "restrictions"].includes(field.id) && <button type="button" className="mt-1 min-h-10 px-2 text-sm underline" onClick={() => onChange(field.id, field.id === "workPending" ? "No pending or declined work reported for this visit." : "No operating restrictions identified within the recorded scope.")}>None to report</button>}
    </label>;
  }
  const ordered = [...template.sections].sort((a, b) => Number(b.fields.some(f => f.type === "condition")) - Number(a.fields.some(f => f.type === "condition")));
  return <div className="space-y-4">
    {ordered.map(section => {
      const checks = section.fields.filter(f => f.type === "condition");
      const related = new Set(checks.flatMap(f => [`${f.id}_notes`, `${f.id}_work`]));
      const extras = section.fields.filter(f => f.type !== "condition" && !related.has(f.id) && !automatic.has(f.id));
      const required = extras.filter(f => f.required || f.id === "serviceDate" || needed.has(f.id));
      const optional = extras.filter(f => !required.includes(f));
      const complete = checks.filter(f => !!data.answers[f.id]).length;
      return <details key={section.id} open={checks.length > 0 || required.length > 0 ? true : undefined} className="border-b border-[var(--color-border)] pb-3">
        <summary className="cursor-pointer py-3 text-base font-semibold">{section.id === "visit" ? "Visit details" : section.title}{checks.length > 0 && <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">{complete}/{checks.length}</span>}</summary>
        <fieldset disabled={disabled} className="min-w-0 space-y-3">
          <legend className="sr-only">{section.title}</legend>
          {checks.map(check => {
            const value = data.answers[check.id] || "";
            const needsReason = value === "D" || value === "NI";
            const note = section.fields.find(f => f.id === `${check.id}_notes`)!;
            const work = section.fields.find(f => f.id === `${check.id}_work`)!;
            return <div key={check.id} className="space-y-2 border-b border-[var(--color-border)] py-3 last:border-b-0">
              <p className="text-sm font-medium">{check.label.replace(/^[GWP]\d+\s/, "")}</p>
              <div role="radiogroup" aria-label={check.label} aria-required="true" className="grid grid-cols-[1fr_1fr_1fr_1.6fr] gap-1.5">
                {conditions.map(({ value: choice, label, title, Icon, color }) => <label key={choice} title={title} className={`relative flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-md border px-1 text-xs font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 ${disabled ? "cursor-default opacity-70" : ""}`} style={{ borderColor: value === choice ? color : "var(--color-border)", background: value === choice ? `${color}12` : "var(--color-surface-1)", color: value === choice ? color : "var(--color-text-secondary)" }}>
                  <input className="sr-only" type="radio" name={`check-${check.id}`} value={choice} aria-label={title} checked={value === choice} onChange={() => onChange(check.id, choice)} />
                  <Icon size={15} aria-hidden="true" />{label}
                </label>)}
              </div>
              {needsReason ? <div className="space-y-2">{field(note)}<details><summary className="cursor-pointer py-2 text-xs">Work performed / reference</summary>{field(work)}</details></div>
                : <details><summary className="cursor-pointer py-2 text-xs text-[var(--color-text-muted)]">Notes / work performed{data.answers[note.id] || data.answers[work.id] ? " (recorded)" : ""}</summary><div className="space-y-2">{field(note)}{field(work)}</div></details>}
            </div>;
          })}
          {required.length > 0 && <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{required.map(field)}</div>}
          {optional.length > 0 && <details open={section.id === "measurements" ? true : undefined}>
            <summary className="cursor-pointer py-2 text-sm text-[var(--color-text-muted)]">{section.id === "measurements" ? "Readings and references" : "Additional details"}</summary>
            <div className="grid min-w-0 grid-cols-1 gap-3 pt-2 sm:grid-cols-2">{optional.map(field)}</div>
          </details>}
        </fieldset>
      </details>;
    })}
  </div>;
}
