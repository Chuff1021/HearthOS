import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createCanvas } from "canvas";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { isSafeReportString, validateReport, type Fuel, type Photo, type ReportData, type ReportSnapshot } from "../../src/lib/service-reports/domain";
import { getServiceTemplate, outcomeOptions, serviceTemplates } from "../../src/lib/service-reports/templates";
import { renderServiceReportPdf } from "../../src/lib/service-reports/pdf";

function fixture(fuel: Fuel): ReportSnapshot {
  const template = getServiceTemplate(fuel);
  const answers: Record<string, string> = {};
  for (const field of template.sections.flatMap((section) => section.fields)) {
    if (field.required) answers[field.id] = field.options?.[0] || "Recorded synthetic test detail.";
  }
  Object.assign(answers, {
    customerName: "UNTRUSTED DRAFT CUSTOMER", technicianName: "UNTRUSTED DRAFT TECHNICIAN",
    serviceDate: "2026-09-10", arrival: "09:00", departure: "10:30", makeModel: "SYNTHETIC appliance / example model", serial: "TEST-0001",
    manualRevision: "Model-specific manual and revision recorded by technician; synthetic sample.",
    codeReference: "Site-specific reference recorded for this visit; synthetic sample.",
    complaint: "Synthetic QA example only. Customer reports intermittent operation.",
    workCompleted: "Accessible areas cleaned and documented. No production data used in this sample.",
    workPending: "No pending work recorded for the synthetic example.",
    restrictions: "No additional restrictions recorded in this synthetic example.",
    acknowledgmentStatus: "Receipt recorded", customerRepresentative: "Taylor Example", acknowledgmentDateTime: "2026-09-10 10:30 CDT",
    nextService: "Per model instructions and recorded use.", totalFlues: "1",
  });
  if (fuel !== "wood") delete answers.totalFlues;
  if (fuel === "wood") Object.assign(answers, {
    chimneyId: "SYNTHETIC-CHIMNEY-1 / living room", totalFlues: "1", flue1_id: "F1",
    flue1_appliance: "Synthetic wood appliance / living room", scanDevice: "Synthetic camera / visual review",
    scanOperator: "Jordan Example", scan1_flueId: "F1", scan1_coverage: "Accessible interior surfaces recorded in synthetic sample.",
    scan1_files: "SYNTHETIC-VIDEO-F1", inspectionBasis: "Routine service of the accessible recorded scope.",
  });
  // Only wood's inventory holds equipment identification; do not add unrecognized fields.
  if (fuel === "wood") { delete answers.makeModel; delete answers.serial; }
  return {
    id: `SYNTHETIC-${fuel}-01`, revision: 2, jobId: "SYNTHETIC-JOB-01", jobNumber: "QA-1001",
    customerId: "SYNTHETIC-CUSTOMER-01", customerName: "Taylor Example", address: "100 Example Lane\nSample City, MO 00000",
    serviceDate: "2026-09-10", equipment: `Synthetic ${fuel} appliance`, technicianName: "Jordan Example",
    technicianId: "SYNTHETIC-TECH-01", finalizedAt: "2026-09-10T15:30:00Z",
    data: { fuel, answers, photoExceptions: {}, customerAcknowledgment: "Taylor Example received an explanation of the recorded findings. Synthetic acknowledgment record only." },
    photos: template.photoSlots.filter((slot) => slot.required).map((slot, i) => ({
      id: `SYNTHETIC-${fuel}-PHOTO-${i + 1}`, slotId: slot.id, caption: `Synthetic ${fuel} evidence ${i + 1}: ${slot.label}.`,
    })),
  };
}

function imageBytes(label = "SYNTHETIC PHOTO", portrait = false, png = false): Buffer {
  const canvas = createCanvas(portrait ? 360 : 720, portrait ? 640 : 450);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ededed"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#333333"; ctx.fillRect(60, 85, canvas.width - 120, canvas.height - 140);
  ctx.fillStyle = "#7ba592"; ctx.fillRect(82, 105, canvas.width - 164, canvas.height - 180);
  ctx.fillStyle = "#ffffff"; ctx.font = "18px sans-serif"; ctx.fillText(label, 20, 35);
  ctx.fillStyle = "#c45d3b"; ctx.fillRect(10, canvas.height - 22, 12, 12);
  return png ? canvas.toBuffer("image/png") : canvas.toBuffer("image/jpeg");
}

const errors = (report: ReportSnapshot) => validateReport(report.data, report.photos);
const fuels: Fuel[] = ["gas", "wood", "pellet"];
for (const fuel of fuels) {
  test(`${fuel}: faithful identifiers, field types, complete valid report and photo policy`, () => {
    const template = getServiceTemplate(fuel);
    const fields = template.sections.flatMap((s) => s.fields);
    const conditions = fields.filter((f) => f.type === "condition");
    const prefix = fuel === "gas" ? "G" : fuel === "wood" ? "W" : "P";
    const count = fuel === "gas" ? 16 : fuel === "wood" ? 15 : 19;
    assert.equal(template.version, 1);
    assert.equal(serviceTemplates[fuel], template);
    assert.equal(new Set(fields.map((f) => f.id)).size, fields.length);
    assert.equal(new Set(template.photoSlots.map((s) => s.id)).size, template.photoSlots.length);
    assert.deepEqual(conditions.map((f) => f.id), Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`));
    for (const field of conditions) {
      assert.deepEqual(field.options, ["S", "D", "NA", "NI"]);
      assert.ok(fields.some((f) => f.id === `${field.id}_notes`));
      assert.ok(fields.some((f) => f.id === `${field.id}_work`));
    }
    for (const id of ["overview", "before", "after", "label"]) assert.equal(template.photoSlots.find((s) => s.id === id)?.required, true);
    for (const id of ["flame", "operation", "termination"]) assert.notEqual(template.photoSlots.find((s) => s.id === id)?.required, true);
    assert.deepEqual(errors(fixture(fuel)), []);
  });

  test(`${fuel}: blank never passes; NI, NA and defect remain distinct`, () => {
    const report = fixture(fuel);
    const id = getServiceTemplate(fuel).sections.flatMap((s) => s.fields).find((f) => f.type === "condition")!.id;
    delete report.data.answers[id];
    assert.ok(errors(report).some((e) => e.includes(`${id})`)));
    report.data.answers[id] = "NA";
    assert.deepEqual(errors(report), []);
    report.data.answers[id] = "NI";
    report.data.answers[`${id}_notes`] = "123456789";
    assert.ok(errors(report).some((e) => e.includes(`${id}_notes`)));
    report.data.answers[`${id}_notes`] = "Access was not available during this visit.";
    assert.deepEqual(errors(report), []);
    report.data.answers[id] = "D";
    assert.ok(errors(report).some((e) => e.includes("no-unresolved-defects")));
    assert.ok(errors(report).some((e) => e.includes("photo or documented exception") && e.includes(id)));
    report.data.answers.outcome = outcomeOptions[1];
    report.data.photoExceptions[id] = "Image not available; documented finding and follow-up recorded.";
    assert.deepEqual(errors(report), []);
    report.data.answers[id] = "PASSED";
    assert.ok(errors(report).some((e) => e.includes("unsupported value")));
  });

  test(`${fuel}: shared validation requires an actual calendar visit date`, () => {
    const report = fixture(fuel);
    for (const invalid of [undefined, "", " ", "2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-01-00", "2026-9-10", "2026-09-10T00:00:00Z", " 2026-09-10 "]) {
      if (invalid === undefined) delete report.data.answers.serviceDate;
      else report.data.answers.serviceDate = invalid;
      assert.ok(errors(report).some((e) => e.includes("valid calendar date")), String(invalid));
    }
    for (const valid of ["2024-02-29", "2026-09-10", "2026-12-31"]) {
      report.data.answers.serviceDate = valid;
      assert.deepEqual(errors(report), []);
    }
  });

  test(`${fuel}: photos require data or explicit, sufficiently detailed exception`, () => {
    const report = fixture(fuel);
    report.photos = report.photos.filter((p) => p.slotId !== "label");
    assert.ok(errors(report).some((e) => e.includes("(label)")));
    report.data.photoExceptions.label = "missing";
    assert.ok(errors(report).some((e) => e.includes("at least 10")));
    report.data.photoExceptions.label = "Identification plate is absent; equipment identification recorded separately.";
    assert.deepEqual(errors(report), []);
    report.photos.push({ ...report.photos[0] });
    assert.ok(errors(report).some((e) => e.includes("Duplicate photo ID")));
    report.photos.pop();
    report.photos.push({ id: "bad-slot", slotId: "other-job-photo", caption: "not accepted" });
    assert.ok(errors(report).some((e) => e.includes("Unsupported photo slot")));
  });

  test(`${fuel}: explicit outcome and customer acknowledgment without a fabricated signature`, () => {
    const report = fixture(fuel);
    delete report.data.answers.outcome;
    assert.ok(errors(report).some((e) => e.includes("outcome")));
    report.data.answers.outcome = outcomeOptions[2];
    assert.ok(errors(report).some((e) => e.includes("notification time")));
    report.data.answers.customerNotifiedTime = "10:30 CDT";
    report.data.answers.acknowledgmentStatus = "Unavailable";
    report.data.customerAcknowledgment = "Customer unavailable at completion; office follow-up arranged.";
    assert.ok(errors(report).some((e) => e.includes("acknowledgmentDelivery")));
    report.data.answers.acknowledgmentDelivery = "Office telephone follow-up requested for 2026-09-10.";
    assert.deepEqual(errors(report), []);
    report.data.answers.acknowledgmentStatus = "Declined";
    report.data.customerAcknowledgment = "Customer declined acknowledgment; findings explained verbally.";
    assert.deepEqual(errors(report), []);
    report.data.customerAcknowledgment = "declined";
    assert.ok(errors(report).some((e) => e.includes("Customer acknowledgment:")));
  });

  test(`${fuel}: legacy empty context metadata is explicitly not recorded without invented values`, async () => {
    const report = fixture(fuel);
    report.jobNumber = "";
    report.address = " \n ";
    report.equipment = "\t ";
    report.data.answers.jobNumber = "DRAFT-JOB-NUMBER";
    report.data.answers.serviceAddress = "DRAFT-SERVICE-ADDRESS";
    const original = structuredClone(report);
    const photos = report.photos.map((p) => ({ ...p, bytes: imageBytes() }));
    const bytes = await renderServiceReportPdf(report, photos);
    if (process.env.SERVICE_REPORT_QA_DIR) {
      mkdirSync(process.env.SERVICE_REPORT_QA_DIR, { recursive: true });
      writeFileSync(path.join(process.env.SERVICE_REPORT_QA_DIR, `${fuel}-legacy.pdf`), bytes);
    }
    const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
    try {
      const content = await (await pdf.getPage(1)).getTextContent();
      const text = content.items.filter((item) => "str" in item).map((item) => item.str).join(" ").replace(/\s+/g, " ");
      for (const label of ["Job number", "Service address", "Equipment"]) assert.ok(text.includes(`${label} Not recorded`), label);
      assert.ok(!text.includes("DRAFT-JOB-NUMBER"));
      assert.ok(!text.includes("DRAFT-SERVICE-ADDRESS"));
      assert.ok(text.includes(report.customerName));
      assert.ok(text.includes(report.technicianName));
      assert.ok(text.includes("Sep 10, 2026"));
      assert.deepEqual(report, original, "Rendering does not alter the snapshot or promote draft metadata");
    } finally { await pdf.destroy(); }
  });

  test(`${fuel}: PDF includes every supplied image, actual electronic signer and page bounds`, async () => {
    const report = fixture(fuel);
    const item = getServiceTemplate(fuel).sections.flatMap((s) => s.fields).find((f) => f.type === "condition")!.id;
    report.data.answers[item] = "D";
    report.data.answers[`${item}_notes`] = "Synthetic defect: component needs further evaluation; findings reviewed with customer.";
    report.data.answers[`${item}_work`] = "C - accessible surfaces cleaned; replacement pending evaluation.";
    report.data.answers.outcome = outcomeOptions[2];
    report.data.answers.customerNotifiedTime = "2026-09-10 10:30 CDT";
    report.data.answers.restrictions = "Do not operate pending the recorded evaluation. Customer notified; synthetic example only.";
    report.data.answers.workPending = "Follow-up evaluation of the recorded component is pending; synthetic appointment requested.";
    report.data.photoExceptions[item] = "Synthetic example: close-up unavailable; finding documented for follow-up.";
    const photos = report.photos.map((p, i) => ({ ...p, bytes: imageBytes(`SYNTHETIC ${i + 1}`, i % 2 === 1, i === 0) }));
    const bytes = await renderServiceReportPdf(report, photos);
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    if (process.env.SERVICE_REPORT_QA_DIR) {
      mkdirSync(process.env.SERVICE_REPORT_QA_DIR, { recursive: true });
      writeFileSync(path.join(process.env.SERVICE_REPORT_QA_DIR, `${fuel}.pdf`), bytes);
    }
    const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false }).promise;
    let text = "";
    let imageCount = 0;
    try {
      assert.ok(pdf.numPages < 35, "ordinary reports have bounded pagination");
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        const words = content.items.filter((item) => "str" in item);
        const pageText = words.map((item) => item.str).join(" ");
        text += pageText;
        if (index === 1) {
          assert.ok(pageText.includes("SR-"));
          assert.ok(pageText.includes(report.jobNumber));
          assert.ok(pageText.includes("Sep 10, 2026"));
          assert.ok(pageText.includes("10:30 AM CDT"));
          assert.ok(pageText.includes("(417) 732-9775"));
          for (const internal of [report.id, report.jobId, report.customerId, report.technicianId, report.finalizedAt]) assert.ok(!pageText.includes(internal), `Internal metadata not in visit summary: ${internal}`);
        }
        assert.ok(pageText.includes(`Page ${index} of ${pdf.numPages}`));
        assert.ok(pageText.includes(getServiceTemplate(fuel).title));
        for (const item of words) if (item.str.trim()) {
          assert.ok(item.transform[4] >= 40 && item.transform[4] + item.width <= 573, `horizontal text bounds on page ${index}: ${item.str}`);
          assert.ok(item.transform[5] >= 20 && item.transform[5] <= 768, `vertical text bounds on page ${index}: ${item.str}`);
        }
        const operators = await page.getOperatorList();
        imageCount += operators.fnArray.filter((op) => op === OPS.paintImageXObject).length;
      }
      assert.equal(imageCount, photos.length);
      for (const photo of photos) { assert.ok(text.includes(photo.id)); assert.ok(text.includes(photo.caption)); }
      assert.ok(text.includes("Jordan Example"));
      assert.ok(text.includes("Technician electronic signature"));
      assert.ok(text.includes(report.finalizedAt));
      for (const internal of [report.id, report.jobId, report.customerId, report.technicianId]) assert.ok(text.includes(internal), "Full identity retained in audit text");
      assert.ok(text.includes("No customer signature has been generated"));
      assert.ok(text.includes("Documented photo exceptions"));
      assert.ok(!text.includes("UNTRUSTED DRAFT TECHNICIAN"));
      assert.ok(!text.includes("UNTRUSTED DRAFT CUSTOMER"));
      assert.match(bytes.toString("latin1"), /Allura/);
      assert.match(bytes.toString("latin1"), /FontFile2/);
    } finally { await pdf.destroy(); }
  });
}

test("all master measurement columns, findings rows, wood inventory and scan continuations exist", () => {
  for (const [fuel, measurementCount] of [["gas", 7], ["pellet", 5]] as const) {
    const fields = getServiceTemplate(fuel).sections.flatMap((s) => s.fields);
    for (const suffix of ["initial", "final", "units", "criterion"]) assert.equal(fields.filter((f) => f.id.endsWith(`_${suffix}`)).length, measurementCount);
  }
  const ids = new Set(serviceTemplates.wood.sections.flatMap((s) => s.fields.map((f) => f.id)));
  for (const id of ["measure_termination_actual", "measure_termination_required", "additionalFlues", "additionalScans", "scan3_coverage", "flue3_liner", "finding3_priority", "additionalFindings", "reviewedAlarms"]) assert.ok(ids.has(id), id);
});

test("runtime malformed types, controls, unknown keys and length limits return validation errors", () => {
  for (const data of [null, {}, { fuel: "oil" }, { fuel: "gas", answers: [], photoExceptions: {} }]) assert.ok(validateReport(data as ReportData, []).length);
  assert.throws(() => getServiceTemplate("oil" as Fuel), /Unsupported/);
  const report = fixture("gas");
  report.data.answers.outcome = 12 as unknown as string;
  report.data.answers.internalCosts = "Must not leak into PDF";
  report.data.answers.complaint = "Bad\u0000control";
  report.data.answers.workCompleted = "x".repeat(12_001);
  assert.ok(errors(report).some((e) => e.includes("Unsupported answer field")));
  assert.ok(errors(report).some((e) => e.includes("Invalid text")));
  assert.ok(!isSafeReportString("hidden\u202eidentity"));
  assert.ok(!isSafeReportString("unpaired\uD800"));
  assert.ok(isSafeReportString("Jos\u00e9 Example\nRecorded text"));
  assert.ok(validateReport(fixture("gas").data, [null] as unknown as Photo[]).length);
});

test("recorded readings require units / governing criteria and limited tests need reasons", () => {
  const report = fixture("gas");
  report.data.answers.inletStatic_initial = "Recorded value";
  assert.ok(errors(report).some((e) => e.includes("inletStatic_units")));
  assert.ok(errors(report).some((e) => e.includes("inletStatic_criterion")));
  Object.assign(report.data.answers, { inletStatic_units: "in w.c.", inletStatic_criterion: "Specific model manual reference", testing: "Withheld" });
  assert.ok(errors(report).some((e) => e.includes("testingReason")));
  report.data.answers.testingReason = "Operation withheld for the recorded service scope.";
  assert.deepEqual(errors(report), []);
});

test("wood incomplete access or scan cannot imply a complete Level 2 inspection", () => {
  const report = fixture("wood");
  report.data.answers.inspectionPerformed = "Level 2";
  report.data.answers.scan = "Not performed";
  report.data.answers.scanReason = "Scan device unavailable; follow-up required.";
  assert.ok(errors(report).some((e) => e.includes("must be recorded as incomplete")));
  report.data.answers.access_roof = "NI";
  assert.ok(errors(report).some((e) => e.includes("access_roof_notes")));
  Object.assign(report.data.answers, {
    access_roof_notes: "Roof access unsafe; no roof access attempted.",
    scopeStatus: "Incomplete; limitations and next steps documented", accessLimits: "Roof access and internal scan unavailable.",
    furtherInvestigation: "Arrange safe access and an internal scan follow-up.",
  });
  assert.deepEqual(errors(report), []);
  report.data.answers.totalFlues = "4";
  assert.ok(errors(report).some((e) => e.includes("additionalFlues")));
});

test("PDF rejects missing, extra, mismatched, corrupt and unsupported images", async () => {
  const report = fixture("gas");
  const photos = report.photos.map((p) => ({ ...p, bytes: imageBytes() }));
  await assert.rejects(renderServiceReportPdf(report, photos.slice(1)), /Every snapshot photo/);
  await assert.rejects(renderServiceReportPdf(report, [...photos, photos[0]]), /Every snapshot photo/);
  await assert.rejects(renderServiceReportPdf(report, photos.map((p, i) => i ? p : { ...p, caption: "changed after snapshot" })), /does not match/);
  await assert.rejects(renderServiceReportPdf(report, photos.map((p, i) => i ? p : { ...p, bytes: Buffer.from("GIF89a") })), /unsupported image type/);
  await assert.rejects(renderServiceReportPdf(report, photos.map((p, i) => i ? p : { ...p, bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]) })), /cannot be decoded/);
  await assert.rejects(renderServiceReportPdf({ ...report, technicianName: " " }, photos), /Invalid technicianName/);
  await assert.rejects(renderServiceReportPdf({ ...report, serviceDate: "2026-02-30" }, photos), /Invalid service date/);
  await assert.rejects(renderServiceReportPdf(report, photos.map((p, i) => i ? p : { ...p, bytes: Buffer.alloc(350 * 1024 + 1) })), /350 KiB/);
});

test("photo count and aggregate text bounds align with the report upload contract", () => {
  const report = fixture("gas");
  while (report.photos.length < 30) report.photos.push({ id: `extra-${report.photos.length}`, slotId: "overview", caption: "Additional evidence" });
  assert.deepEqual(errors(report), []);
  report.photos.push({ id: "excess", slotId: "overview", caption: "Excess evidence" });
  assert.ok(errors(report).some((e) => e.includes("At most 30 photos")));
  const notes = serviceTemplates.gas.sections.flatMap((s) => s.fields).filter((f) => f.type === "textarea");
  for (const field of notes) report.data.answers[field.id] = "x".repeat(12_000);
  assert.ok(errors(report).some((e) => e.includes("supported total length")));
});

test("optional context still rejects invalid text; identity and valid calendar service date remain required", async () => {
  const report = fixture("gas");
  const photos = report.photos.map((p) => ({ ...p, bytes: imageBytes() }));
  for (const key of ["jobNumber", "address", "equipment"] as const) {
    for (const value of [null, undefined, 42, "unsafe\u0000text", "x".repeat(key === "jobNumber" ? 201 : 2001)]) {
      await assert.rejects(renderServiceReportPdf({ ...report, [key]: value }, photos), new RegExp(`Invalid ${key}`));
    }
  }
  for (const key of ["id", "jobId", "customerId", "customerName", "technicianId", "technicianName", "serviceDate", "finalizedAt"] as const) {
    await assert.rejects(renderServiceReportPdf({ ...report, [key]: " " }, photos), new RegExp(`Invalid ${key}`));
  }
  for (const serviceDate of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-9-10", "2026-09-10T00:00:00Z"]) {
    await assert.rejects(renderServiceReportPdf({ ...report, serviceDate }, photos), /Invalid service date/);
  }
  const bytes = await renderServiceReportPdf({ ...report, serviceDate: "2024-02-29",
    data: { ...report.data, answers: { ...report.data.answers, serviceDate: "2024-02-29" } } }, photos);
  const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  try {
    const content = await (await pdf.getPage(1)).getTextContent();
    assert.ok(content.items.some((item) => "str" in item && item.str === "Feb 29, 2024"));
  } finally { await pdf.destroy(); }
});

test("long paragraphs, unbroken strings and captions paginate without losing end markers", async () => {
  const report = fixture("gas");
  report.data.answers.workCompleted = "Recorded long narrative. ".repeat(350) + " NARRATIVE-END";
  report.data.answers.additionalFindings = "Q".repeat(2500) + "UNBROKEN-END";
  report.photos[0].caption = "Detailed photo caption. ".repeat(65) + " CAPTION-END";
  const photos = report.photos.map((p) => ({ ...p, bytes: imageBytes() }));
  const bytes = await renderServiceReportPdf(report, photos);
  if (process.env.SERVICE_REPORT_QA_DIR) writeFileSync(path.join(process.env.SERVICE_REPORT_QA_DIR, "gas-long.pdf"), bytes);
  const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  let text = "";
  try {
    assert.ok(pdf.numPages < 60);
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
      const content = await (await pdf.getPage(pageIndex)).getTextContent();
      text += content.items.filter((item) => "str" in item).map((item) => item.str).join(" ");
    }
    for (const marker of ["NARRATIVE-END", "UNBROKEN-END", "CAPTION-END"]) assert.ok(text.includes(marker), marker);
  } finally { await pdf.destroy(); }
});
