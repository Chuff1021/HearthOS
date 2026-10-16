import type { Field, Template } from "./templates";

const text = (id: string, label: string, required = false): Field => ({ id, label, type: "text", required });
const note = (id: string, label: string, required = false): Field => ({ id, label, type: "textarea", required });
const select = (id: string, label: string, options: string[], required = false): Field => ({ id, label, type: "select", options, required });
export const gasChecks = [
  ["GD01", "Check / test door for CO leak before service"],
  ["GD02", "Check / test gas pressure input and manifold"],
  ["GD03", "Check / test burner assembly"],
  ["GD04", "Check / test thermopile"],
  ["GD05", "Check / test thermocouple"],
  ["GD06", "Inspect flame sensor"],
  ["GD07", "Inspect all gaskets"],
  ["GD08", "Inspect heat exchanger / body"],
  ["GD09", "Clean firebox"],
  ["GD10", "Clean and inspect fan"],
  ["GD11", "Megohmmeter test on fan"],
  ["GD12", "Check / change remote and receiver batteries"],
  ["GD13", "Fire appliance; verify operation with and without remote"],
  ["GD14", "Check / test door for CO leak after service"],
  ["GD15", "Test all accessible gas fittings with liquid and electronic detector"],
] as const;
export const gasReadings: Record<string, Array<[string, string]>> = {
  GD01: [["coBefore", "CO before service (ppm)"]],
  GD02: [["gasInlet", "Gas inlet pressure (in. w.c.)"], ["gasManifold", "Gas manifold pressure (in. w.c.)"]],
  GD04: [["thermopileInitial", "Thermopile initial (mV)"], ["thermopileDrop", "Thermopile drop test (mV)"]],
  GD05: [["thermocouple", "Thermocouple (mV)"]],
  GD11: [["fanResistance", "Fan insulation resistance (megohms)"]],
  GD14: [["coAfter", "CO after service (ppm)"]],
};
export const gasDiagnosticTemplate: Template = {
  id: "gas", version: 2, title: "Gas Diagnostic Checklist",
  sections: [
    { id: "visit", title: "Customer and visit", fields: [
      text("companyName", "Company"), text("companyContact", "Company contact"), text("customerName", "Customer"),
      text("customerContact", "Customer phone"), text("serviceAddress", "Service address"), text("jobNumber", "Service order"),
      text("serviceDate", "Service date", true), text("technicianName", "Technician"),
    ] },
    { id: "equipment", title: "Gas appliance", fields: [
      text("unitMake", "Unit make", true), text("unitModel", "Unit model", true), text("makeModel", "Existing equipment record"), text("serial", "Serial number"),
      select("gasFuel", "Gas type", ["NG", "LP"], true), select("pilotType", "Pilot type", ["IPI", "Safety pilot", "Other"], true),
      select("applianceType", "Gas appliance", ["Fireplace", "Stove", "Insert", "Log set", "Other"], true),
      text("applianceOther", "Other appliance"), text("pilotOther", "Other pilot system"),
    ] },
    { id: "diagnostic", title: "Service checklist", fields: gasChecks.flatMap(([id, label]): Field[] => [
      { id, label, type: "condition", options: ["N", "S", "D", "NA", "NI"] },
      note(`${id}_notes`, "Finding / reason not checked"), text(`${id}_work`, "Work performed / part number"),
      ...(gasReadings[id] || []).map(([key, name]) => ({ ...text(key, name), checkId: id })),
      ...(id === "GD12" ? [text("remoteBrand", "Remote brand"), select("newBatteries", "New batteries", ["Yes", "No", "NA"]), select("customerBatteries", "Customer provided batteries", ["Yes", "No", "NA"])].map(f => ({ ...f, checkId: id })) : []),
      ...(id === "GD15" ? [{ ...select("gasLeakResult", "Gas leak result", ["No leaks detected", "Leak detected", "Not tested"]), checkId: id }] : []),
    ]) },
    { id: "findings", title: "Work and results", fields: [
      note("workCompleted", "Work completed and notes"), note("diagnosticResults", "Diagnostic results / service required"),
      select("npr", "NPR (form designation)", ["Yes", "No"]), text("testReference", "Manufacturer test procedure / model-specific criteria"),
      note("workPending", "Pending / declined work and follow-up"),
      select("outcome", "Recorded outcome", ["Work complete; no unresolved defects observed within the recorded scope.", "Corrections or additional inspection needed. Record any use restrictions below.", "Do not operate pending correction / further evaluation."]),
      note("restrictions", "Operating restrictions / action taken / person notified"), text("customerNotifiedTime", "Do not operate: customer notified time"),
    ] },
    { id: "parts", title: "Recommended parts and maintenance (optional)", fields: [
      ...[1, 2, 3, 4].flatMap(n => [
        ...(n < 4 ? [text(`part${n}_description`, `Part ${n}: description`)] : []),
        text(`part${n}_number`, `${n === 4 ? "Maintenance program" : `Part ${n}`}: part number`),
        text(`part${n}_warranty`, `${n === 4 ? "Maintenance program" : `Part ${n}`}: warranty`),
        text(`part${n}_cost`, `${n === 4 ? "Maintenance program" : `Part ${n}`}: flat rate installed ($)`),
        select(`part${n}_decision`, `${n === 4 ? "Maintenance program" : `Part ${n}`}: customer decision`, ["Accept", "Decline", "Pending"]),
        select(`part${n}_installed`, `${n === 4 ? "Maintenance program" : `Part ${n}`}: installed`, ["Yes", "No"]),
        select(`part${n}_prepaid`, `${n === 4 ? "Maintenance program" : `Part ${n}`}: prepaid`, ["Yes", "No"]),
      ]),
    ] },
    { id: "payment", title: "Payment record (optional; does not charge customer)", fields: [
      text("checkNumber", "Check number"), select("creditCard", "Paid by credit card", ["Yes", "No"]),
      text("subtotal", "Subtotal ($)"), text("tax", "Tax ($)"), text("total", "Total ($)"),
    ] },
  ],
  photoSlots: [
    { id: "overview", label: "Appliance overview", required: true },
    { id: "before", label: "Condition before service", required: true },
    { id: "after", label: "Completed / reassembled appliance", required: true },
    { id: "label", label: "Rating / serial plate", required: true },
    { id: "firebox", label: "Firebox / burner after cleaning", required: true },
    { id: "flame", label: "Operating flame (only when safe)", required: false },
    ...gasChecks.map(([id, label]) => ({ id, label: `Issue: ${label}`, required: false })),
  ],
};
