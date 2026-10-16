"use client";

import type { ReportData } from "@/lib/service-reports/domain";
import { gasChecks, gasReadings } from "@/lib/service-reports/gas-template";
import { getServiceTemplate } from "@/lib/service-reports/templates";
import styles from "./GasPaperChecklist.module.css";

type Props = { data: ReportData; disabled: boolean; photoCount: number; onChange: (id: string, value: string) => void };
const printedLabels: Record<string, string> = {
  GD01: "Check/Test Door for CO Leak", GD02: "Check/Test Gas Pressure Input",
  GD03: "Check/Test Burner Assembly", GD04: "Check/Test Thermopile", GD05: "Check/Test Thermocouple",
  GD06: "Inspect Flame Sensor", GD07: "Inspect all Gaskets", GD08: "Inspect Heat Exchanger/Body",
  GD09: "Clean Firebox", GD10: "Clean & Inspect Fan", GD11: "Megohmmeter Test on Fan",
  GD12: "Check/Change Batteries in Remote/Receiver if applicable",
  GD13: "Fire Off Appliance - Verify Unit Operation w/ and w/o remote",
  GD14: "Check/Test Door for CO Leak", GD15: "Test for Gas Leak at All Fittings",
};
const readingLabels: Record<string, string> = {
  coBefore: "Carbon Monoxide Measurement Prior to Service (ppm)", coAfter: "Carbon Monoxide Measurement After Service (ppm)",
  gasInlet: 'Gas PSI Inlet (in. wc)', gasManifold: 'Gas PSI Manifold/output (in. wc)',
  thermopileInitial: "Initial Test (mV)", thermopileDrop: "Drop Test (mV)", thermocouple: "Thermocouple Test (mV)",
};

export default function GasPaperChecklist({ data, disabled, photoCount, onChange }: Props) {
  const a = data.answers;
  const input = (id: string, label: string, type = "text", readOnly = false) => <label className={styles.field} key={id}>
    <span>{label}</span><input aria-label={label} type={type} inputMode={type === "number" ? "decimal" : undefined}
      min={type === "number" ? "0" : undefined} step={type === "number" ? "any" : undefined}
      value={a[id] || ""} maxLength={8000} readOnly={readOnly} onChange={e => onChange(id, e.target.value)} />
  </label>;
  const memo = (id: string, label: string) => <label className={styles.field}><span>{label}</span>
    <textarea aria-label={label} maxLength={8000} value={a[id] || ""} onChange={e => onChange(id, e.target.value)} />
  </label>;
  const tick = (id: string, label: string, yes = "Yes") => <label className={styles.tick}>
    <input type="checkbox" checked={a[id] === yes} onChange={e => onChange(id, e.target.checked ? yes : "")} />{label}
  </label>;
  const choices = (id: string, label: string, values: string[]) => <fieldset className={styles.choices}>
    <legend>{label}</legend>{values.map(value => <label key={value}>
      <input type="radio" name={`paper-${id}`} value={value} checked={a[id] === value} onChange={() => onChange(id, value)} />{value}
    </label>)}
  </fieldset>;
  // Older v2 drafts may contain additional answers. Keep them editable without
  // asking a new inspection to fill fields absent from the supplied paper form.
  const extraIds = new Set(["testReference", "outcome", "restrictions", "workPending", "customerNotifiedTime", "pilotOther", "applianceOther", "fanResistance",
    ...gasChecks.flatMap(([id]) => [`${id}_notes`, `${id}_work`])]);
  const savedExtras = getServiceTemplate("gas", 2).sections.flatMap(s => s.fields).filter(f => extraIds.has(f.id) && a[f.id]);
  return <div className={styles.container}>
    <fieldset disabled={disabled} className={styles.paper} aria-label="Gas Diagnostic paper form">
      <div className={styles.heading}>
        <div className={styles.company}>
          {/* This is the unchanged logo image and transparency mask embedded in the supplied PDF. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/service-forms/aarons-logo.png" alt="Aaron's Fireplace Company" width={80} height={74} />
          <div><strong>AARON&apos;S FIREPLACE COMPANY</strong><br />611 E Harrison St | Republic, MO 65738<br />(417) 732-9775<br />aaronsfireplaceco@yahoo.com</div>
        </div>
        <h3>Gas Diagnostic Checklist</h3>
      </div>
      <div className={styles.identity}>
        <div>{input("serviceDate", "Service Date", "date")}{input("jobNumber", "Service Order #", "text", true)}
          {input("unitMake", "Unit Make")}{input("unitModel", "Unit Model")}{input("serial", "Serial #")}</div>
        <div>{input("customerName", "Customer Name", "text", true)}{input("customerContact", "Phone Number", "text", true)}
          {input("serviceAddress", "Address", "text", true)}</div>
      </div>
      <div className={styles.appliance}>
        {choices("gasFuel", "Gas Type", ["NG", "LP"])}
        {choices("pilotType", "Pilot Type", ["IPI", "Safety pilot"])}
        {choices("applianceType", "Gas Appliance", ["Fireplace", "Stove", "Insert", "Log set"])}
      </div>
      <div className={styles.inspection}>
        <div className={styles.notes}>{memo("workCompleted", "Work Completed & Notes")}</div>
        <div className={styles.checks}>
          <div className={styles.columnHead} aria-hidden="true"><span>New</span><span>Working</span><span>Replace</span><span>Checklist</span></div>
          {gasChecks.map(([id]) => <div key={id} data-check-id={id} className={styles.checkRow}>
            {id === "GD15" && <div className={styles.photoLine}>Pictures uploaded into system? <strong>{photoCount > 0 ? `Yes (${photoCount})` : "No"}</strong></div>}
            <div className={styles.status} role="radiogroup" aria-label={`${id} ${printedLabels[id]}`}>
              {[["N", "New"], ["S", "Working"], ["D", "Replace"]].map(([value, label]) => <label key={value} title={label}>
                <input type="radio" value={value} aria-label={label} name={`paper-${id}`} checked={a[id] === value} onChange={() => onChange(id, value)} />
                <span>{label}</span>
              </label>)}
            </div>
            <div className={styles.checkContent}>
              <strong>{printedLabels[id]}</strong>
              {id === "GD04" && <small>Initial: failure 0-350 mV / replace &lt;=400 mV. Drop: failure 0-150 mV / replacement &lt;=220 mV.</small>}
              {id === "GD05" && <small>Failure 0-14 mV / replace &lt;=18 mV.</small>}
              {id === "GD11" && <small>Good condition 100+ megohms. Failure 0-30 / replace 30-100 megohms (poor condition).</small>}
              <div className={styles.readings}>{id !== "GD11" && (gasReadings[id] || []).map(([key]) => input(key, readingLabels[key], "number"))}</div>
              {["GD02", "GD04", "GD05"].includes(id) && tick(id, "Could Not Test/Not Accessible", "NI")}
              {id === "GD12" && <>{input("remoteBrand", "Remote Brand")}<div className={styles.inline}>{tick("newBatteries", "New Batteries")}{tick("customerBatteries", "Customer Provided")}</div></>}
              {id === "GD15" && <><small>Test with liquid and electronic detector.</small>{tick("gasLeakResult", "No leaks detected", "No leaks detected")}</>}
              <label className={styles.skip}><input type="checkbox" checked={a[id] === "NA"} onChange={e => onChange(id, e.target.checked ? "NA" : "")} />N/A</label>
              {a[id] === "NI" && !["GD02", "GD04", "GD05"].includes(id) && <span className={styles.previous}>Not checked (saved)</span>}
            </div>
          </div>)}
        </div>
      </div>
      <small className={styles.reference}>Printed reference values from your form. Use the appliance manufacturer&apos;s specifications; readings are not automatically graded.</small>
      <div className={styles.results}>{memo("diagnosticResults", "Diagnostic Results/Service Required")}{tick("npr", "NPR")}</div>
      <details className={styles.parts} open={[1,2,3,4].some(n => a[`part${n}_description`] || a[`part${n}_number`] || a[`part${n}_cost`]) || undefined}>
        <summary>Recommended/Quoted Parts</summary>
        <div className={styles.partsGrid}>
          {[1,2,3,4].map(n => <fieldset key={n} className={n === 4 ? styles.maintenance : styles.part}>
            <legend>{n === 4 ? "Preventative Maintenance Program" : `Part ${n}`}</legend>
            <div className={styles.partFields}>{n < 4 && input(`part${n}_description`, `Part ${n} - Recommended/Quoted Parts`)}
              {input(`part${n}_number`, `${n === 4 ? "Maintenance" : `Part ${n}`} - Part Number`)}
              {input(`part${n}_warranty`, `${n === 4 ? "Maintenance" : `Part ${n}`} - Warranty`)}
              {input(`part${n}_cost`, `${n === 4 ? "Maintenance" : `Part ${n}`} - Flat Rate Cost Installed ($)`, "number")}</div>
            <div className={styles.inline}>{choices(`part${n}_decision`, `Part ${n} - Customer decision`, ["Accept", "Decline"])}
              {tick(`part${n}_installed`, "Installed")}{tick(`part${n}_prepaid`, "Prepaid")}</div>
          </fieldset>)}
        </div>
      </details>
      <div className={styles.payment}>
        <div className={styles.signature}><strong>Customer Signature</strong><span>Not captured</span></div>
        <div>{input("checkNumber", "Check #")}{tick("creditCard", "CC")}</div>
        <div>{input("subtotal", "Subtotal ($)", "number")}{input("tax", "Tax ($)", "number")}{input("total", "Total ($)", "number")}</div>
      </div>
      {savedExtras.length > 0 && <details className={styles.saved}><summary>Additional saved information</summary>
        {savedExtras.map(f => f.type === "select" ? <label className={styles.field} key={f.id}><span>{f.label}</span><select value={a[f.id]} onChange={e => onChange(f.id, e.target.value)}><option value="">Not recorded</option>{f.options?.map(v => <option key={v}>{v}</option>)}</select></label> : <div key={f.id}>{memo(f.id, f.label)}</div>)}
      </details>}
    </fieldset>
  </div>;
}
