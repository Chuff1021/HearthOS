import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { createCanvas } from "canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getServiceTemplate, currentServiceVersion, outcomeOptions } from "../../src/lib/service-reports/templates";
import { gasChecks, gasReadings } from "../../src/lib/service-reports/gas-template";
import { validateReport, type ReportSnapshot } from "../../src/lib/service-reports/domain";
import { parseReportData } from "../../src/lib/service-reports/store";
import { renderServiceReportPdf } from "../../src/lib/service-reports/pdf";

export function gasFixture(): ReportSnapshot {
  const template = getServiceTemplate("gas", 2);
  const answers: Record<string,string> = {
    serviceDate: "2026-10-16", unitMake: "SAMPLE MAKE", unitModel: "QA-100", serial: "SAMPLE-12345", customerContact: "417-555-0100",
    gasFuel: "NG", pilotType: "Safety pilot", applianceType: "Fireplace", workCompleted: "Synthetic example: accessible firebox cleaned and recorded.",
    diagnosticResults: "SAMPLE ONLY - not an actual inspection.", workPending: "No pending work in this synthetic example.", restrictions: "Synthetic example only; no operating determination.",
    outcome: outcomeOptions[0], testReference: "Synthetic manufacturer procedure; not valid test criteria.", gasLeakResult: "No leaks detected",
    remoteBrand: "SAMPLE", newBatteries: "Yes", customerBatteries: "Yes", npr: "No",
    part1_description: "Synthetic example part", part1_number: "QA-123", part1_cost: "125.00", part1_warranty: "No", part1_decision: "Accept", part1_installed: "Yes", part1_prepaid: "No",
    subtotal: "125.00", tax: "0.00", total: "125.00", creditCard: "No", checkNumber: "1234",
  };
  for (const [id] of gasChecks) answers[id] = "S";
  for (const rows of Object.values(gasReadings)) for (const [id] of rows) answers[id] = id.startsWith("co") ? "0" : "123.45";
  return { id: "SYNTHETIC-GAS-V2", revision: 1, jobId: "SAMPLE-JOB", jobNumber: "SAMPLE-100", customerId: "SAMPLE-CUSTOMER",
    customerName: "Sample Customer", address: "100 Example Street, Sample City", serviceDate: "2026-10-16", equipment: "SAMPLE MAKE QA-100",
    technicianId: "SAMPLE-TECH", technicianName: "Sample Technician", finalizedAt: "2026-10-16T15:00:00Z",
    data: { fuel: "gas", templateVersion: 2, answers, photoExceptions: {}, customerAcknowledgment: "Synthetic acknowledgment only, not a customer signature." },
    photos: template.photoSlots.filter(s => s.required).map(s => ({ id: `SAMPLE-${s.id}`, slotId: s.id, caption: `Synthetic QA image: ${s.label}` })),
  };
}
test("gas v2 is explicit and legacy / wood / pellet templates remain v1", () => {
  assert.equal(currentServiceVersion("gas"), 2);
  for (const fuel of ["gas","wood","pellet"] as const) assert.equal(getServiceTemplate(fuel).version, 1);
  assert.equal(getServiceTemplate("gas",2).sections.flatMap(s=>s.fields).filter(f=>f.type==="condition").length, 15);
  const report=gasFixture(); assert.deepEqual(validateReport(report.data,report.photos),[]);
  assert.deepEqual(parseReportData(report.data),report.data);
  assert.throws(()=>parseReportData({...report.data,templateVersion:3}));
  assert.throws(()=>parseReportData({...report.data,fuel:"wood"}));
});
test("no default passes; readings, reasons, issue photos and safe outcomes enforced", () => {
  const r=gasFixture(); delete r.data.answers.coBefore;
  assert.ok(validateReport(r.data,r.photos).some(e=>e.includes("coBefore")));
  r.data.answers.GD01="NI"; r.data.answers.GD01_notes="Inaccessible test point; follow-up required.";
  assert.deepEqual(validateReport(r.data,r.photos),[]);
  r.data.answers.GD15="D"; r.data.answers.gasLeakResult="Leak detected";
  const errors=validateReport(r.data,r.photos);
  assert.ok(errors.some(e=>e.includes("GD15"))); assert.ok(errors.some(e=>e.includes("leak")));
  r.data.answers.gasInlet="NaN"; assert.ok(validateReport(r.data,r.photos).some(e=>e.includes("gasInlet")));
  const blank={fuel:"gas" as const,templateVersion:2 as const,answers:{},photoExceptions:{},customerAcknowledgment:""};
  assert.equal(validateReport(blank,[]).filter(e=>/is required \(GD/.test(e)).length,15);
});
test("exact master retained; completed PDF contains every answer and photo with no forged customer signature", async () => {
  const master="src/assets/service-forms/aarons-gas-diagnostic-v2.pdf";
  const before=createHash("sha256").update(readFileSync(master)).digest("hex");
  const report=gasFixture(); report.data.answers.workCompleted+=" Long unique overflow detail. ".repeat(30);
  const canvas=createCanvas(600,400);const ctx=canvas.getContext("2d");ctx.fillStyle="#f0f2f5";ctx.fillRect(0,0,600,400);ctx.fillStyle="#334155";ctx.font="28px sans-serif";ctx.fillText("SYNTHETIC PHOTO - QA ONLY",50,200);
  const pdf=await renderServiceReportPdf(report,report.photos.map(p=>({...p,bytes:canvas.toBuffer("image/jpeg")})));
  assert.equal(createHash("sha256").update(readFileSync(master)).digest("hex"),before);
  const parsed=await PDFDocument.load(pdf); assert.ok(parsed.getPageCount()>2);
  const doc=await getDocument({data:new Uint8Array(pdf),useSystemFonts:true,disableFontFace:true}).promise;
  let text="";for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);text+=(await page.getTextContent()).items.map(i=>"str" in i?i.str:"").join(" ")+"\n";}
  for(const value of ["Sample Customer","QA-100","SAMPLE-12345","QA-123","125.00","Long unique overflow detail","Sample Technician","No customer signature has been generated","new diagnostic charge"]) assert.ok(text.includes(value),value);
  for(const photo of report.photos) assert.ok(text.includes(photo.id));
  await doc.destroy();
  mkdirSync("/Users/fireplace/output/pdf",{recursive:true});
  writeFileSync("/Users/fireplace/output/pdf/aarons-gas-checklist-completed-SAMPLE.pdf",pdf);
});
