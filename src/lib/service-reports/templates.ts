export type Fuel = "gas" | "wood" | "pellet";
export type Field = {
  id: string;
  label: string;
  type: "text" | "textarea" | "condition" | "select";
  required?: boolean;
  options?: string[];
};
export type Template = {
  id: Fuel;
  version: 1;
  title: string;
  sections: { id: string; title: string; fields: Field[] }[];
  photoSlots: { id: string; label: string; required: boolean }[];
};

export const conditionOptions = ["S", "D", "NA", "NI"];
export const outcomeOptions = [
  "Work complete; no unresolved defects observed within the recorded scope.",
  "Corrections or additional inspection needed. Record any use restrictions below.",
  "Do not operate pending correction / further evaluation.",
];
export const acknowledgmentNotice = "This record describes the work and accessible conditions documented for this visit. Uninspected or concealed conditions are not represented as satisfactory. Customer acknowledgment confirms receipt and explanation of findings; it does not waive rights or approve continued use of an unsafe system.";

const text = (id: string, label: string, required = false): Field => ({ id, label, type: "text", required });
const notes = (id: string, label: string, required = false): Field => ({ id, label, type: "textarea", required });
const select = (id: string, label: string, options: string[], required = true): Field => ({ id, label, type: "select", options, required });
const recorded = (id: string, label: string): Field => select(id, label, ["Recorded", "Not recorded", "NA"], false);
const section = (id: string, title: string, fields: Field[]) => ({ id, title, fields });
const checks = (prefix: string, start: number, labels: string[]): Field[] => labels.flatMap((label, index) => {
  const id = `${prefix}${String(start + index).padStart(2, "0")}`;
  return [
    { id, label: `${id} ${label}`, type: "condition" as const, options: [...conditionOptions], required: true },
    text(`${id}_work`, `${id} Work / ref (C = cleaned; A = adjusted; R = replaced; finding / photo IDs)`),
    notes(`${id}_notes`, `${id} Finding / reason not inspected (at least 10 characters for D or NI)`),
  ];
});
const readings = (rows: [string, string][]): Field[] => rows.flatMap(([id, label]) => [
  text(`${id}_initial`, `${label} - initial`), text(`${id}_final`, `${label} - final`),
  text(`${id}_units`, `${label} - units`), text(`${id}_criterion`, `${label} - criterion / manual ref`),
]);

// Master metadata remains editable in drafts; finalized identity is sourced from ReportSnapshot.
const visit = () => section("visit", "Customer and visit", [
  text("companyName", "Company"), text("companyContact", "Company phone / email"),
  text("customerName", "Customer"), text("customerContact", "Customer phone / email"),
  text("serviceAddress", "Service address"), text("jobNumber", "Job number"),
  text("serviceDate", "Service date"), text("arrival", "Arrival"), text("departure", "Departure"),
  text("technicianName", "Technician (finalized from authenticated account)"),
]);
const equipment = (): Field[] => [
  text("makeModel", "Make / model"), text("serial", "Serial"), text("location", "Appliance location"),
];
const references = (): Field[] => [
  text("manualRevision", "Manual / revision"), text("codeReference", "Applicable code / reference"),
];
const testSetup = (): Field[] => [
  text("instruments", "Test instruments / IDs"), text("instrumentCheck", "Calibration or function check"),
];
const alarms = (ambient: boolean): Field[] => [
  ...(ambient ? [text("coBefore", "Ambient CO before (ppm)"), text("coDuring", "Ambient CO during (ppm)"),
    text("coAfter", "Ambient CO after (ppm)"), text("coLocationTimes", "Ambient CO location / times")] : []),
  select("coAlarm", "CO alarm", ["Present", "Absent", "Not verified"]),
  select("coAlarmTest", "CO alarm test", ["Pass", "Fail", "Not tested"]),
  notes("alarmConcerns", "Alarm location / test method / concerns"),
];
const completion = () => [
  section("findings", "Findings and corrective work", [
    ...[1, 2, 3].flatMap((n) => [text(`finding${n}_reference`, `Finding ${n} - item / photo ID`),
      notes(`finding${n}_correction`, `Finding ${n} - finding and recommended correction`),
      text(`finding${n}_priority`, `Finding ${n} - priority / owner / due date`)]),
    notes("additionalFindings", "Additional findings, item / photo IDs, corrections, priority / owner / due dates"),
  ]),
  section("serviceRecord", "Service record and recorded outcome", [
    notes("workCompleted", "Work completed and parts used including part numbers", true),
    notes("workPending", "Work pending or declined and reason / follow-up appointment", true),
    select("outcome", "Recorded outcome", [...outcomeOptions]),
    text("customerNotifiedTime", "Do not operate: customer notified time"),
    notes("restrictions", "Restrictions, isolation action taken and person notified", true),
  ]),
  section("handoff", "Handoff and acknowledgment", [
    recorded("reviewedFindings", "Reviewed: findings"), recorded("reviewedOperation", "Reviewed: operation / controls"),
    recorded("reviewedMaintenance", "Reviewed: maintenance interval"), recorded("reviewedAlarms", "Reviewed: alarm concerns"),
    text("nextService", "Next recommended service"), text("attachmentIds", "Photo / video / attachment IDs"),
    select("acknowledgmentStatus", "Customer acknowledgment status", ["Receipt recorded", "Unavailable", "Declined"]),
    text("customerRepresentative", "Customer / representative (recorded name, not a generated signature)"),
    text("acknowledgmentDateTime", "Customer acknowledgment date / time"),
    text("acknowledgmentDelivery", "Unavailable / declined: delivery method and date"),
  ]),
];

const gasSections = [visit(), section("equipment", "Gas appliance", [
  ...equipment(), select("applianceType", "Appliance", ["Fireplace", "Insert", "Stove", "Log set", "Other"]),
  text("applianceOther", "Other appliance"), select("installationLocation", "Installation", ["Indoor", "Outdoor"]),
  select("gasFuel", "Gas fuel", ["NG", "LP"]),
  select("venting", "Venting", ["Direct vent", "Natural draft / B vent", "Vent free", "Other"]),
  text("ventingOther", "Other venting"), select("ignition", "Ignition", ["Standing pilot", "Electronic", "Other"]),
  text("ignitionOther", "Other ignition"), text("controlSystem", "Control system"), ...references(),
  text("gasShutoff", "Gas shutoff location"), text("electricalIsolation", "Electrical isolation location"),
]), section("initial", "Visit and initial conditions", [
  select("purpose", "Purpose", ["Routine service", "Diagnostic", "Follow-up"]), text("lastService", "Last service"),
  notes("complaint", "Complaint, fault codes, changes to equipment / room, or reported odor / CO alarm / delayed ignition"),
  select("testing", "Testing", ["Authorized and performed", "Limited", "Withheld"]),
  notes("testingReason", "Testing limitations / withheld reason and action"),
]), section("visual", "Visual inspection and cleaning", [
  ...checks("G", 1, ["Rating label, fuel configuration and approved components", "Glass, gasket, frame, latches, barrier and screen",
    "Firebox, logs / media and placement per model instructions", "Burner, ports, pilot / igniter and flame sensor",
    "Valve compartment, wiring, grounding and connections", "Blower, air passages and circulation openings",
    "Accessible vent joints, supports, termination and air intake", "Hearth, mantel, nearby combustibles and air supply"]),
  select("cleaningPreparation", "Cleaning preparation", ["Cooled and isolated per manual", "Not performed"]),
  notes("cleaningPreparationReason", "Preparation not performed: reason / findings"),
  notes("accessLimits", "Inspection access limits and observed heat / soot / moisture damage by item ID"),
]), section("measurements", "Gas tests and operating checks", [
  ...testSetup(), notes("testConditions", "Test conditions: firing rate, other appliances, doors / fans and weather"),
  ...readings([["inletStatic", "Inlet gas pressure static"], ["inletOperating", "Inlet gas pressure operating"],
    ["manifold", "Manifold pressure low / high (where applicable)"], ["voltage", "Supply voltage / battery (where applicable)"],
    ["flameSignal", "Pilot / flame signal (where applicable)"], ["draft", "Draft / combustion reading (where applicable)"],
    ["otherTest", "Other model-specific test (where applicable)"]]),
  notes("additionalReadings", "Extra readings: test point, operating state, units and criterion / manual reference"),
]), section("operating", "Leak check and operating verification", [
  text("leakMethod", "Leak check method / instrument"), text("leakLocations", "Accessible locations checked"),
  text("leakInitial", "Leak check initial result"), text("leakFinal", "Leak check final result"),
  text("leakReference", "Leak check photo / finding ID"),
  ...checks("G", 9, ["Ignition, burner carryover, pilot stability and flame pattern", "Controls, remote, thermostat and blower operation",
    "Safety / shutdown functions checked per specified procedure", "Natural draft only: draft / spillage under required conditions",
    "Vent free only: ODS, room air provisions and model limits", "Glass / barrier / media reinstalled and access secured",
    "Opened pressure taps / connections resealed and leak checked", "Final operation and customer settings verified"]),
]), section("alarms", "Room air and alarm observations", alarms(true)), ...completion()];

const pelletSections = [visit(), section("equipment", "Pellet appliance", [
  ...equipment(), select("applianceType", "Appliance", ["Stove", "Insert", "Other"]), text("applianceOther", "Other appliance"),
  text("pelletFuel", "Fuel type / brand"), text("controlSystem", "Control system"), text("ventDetails", "Vent make / type / size"),
  ...references(), text("electricalIsolation", "Electrical isolation location"), text("outsideAir", "Outside air provision"),
]), section("initial", "Visit and initial conditions", [
  select("purpose", "Purpose", ["Routine service", "Diagnostic", "Follow-up"]), text("lastService", "Last service / fuel used since"),
  notes("complaint", "Complaint, fault codes, shutdown issues, smoke / CO events or changes since last visit"),
  select("testing", "Testing", ["Performed", "Limited", "Withheld"]), notes("testingReason", "Testing limitations / withheld reason and action"),
  select("shutdownPreparation", "Full shutdown and cooling completed", ["Completed", "Not performed", "NA"]),
  select("electricalPreparation", "Electrical isolation per manual", ["Completed", "Not performed", "NA"]),
  notes("cleaningPreparationReason", "Preparation not performed: reason / findings"),
]), section("appliance", "Appliance inspection and cleaning", [
  ...checks("P", 1, ["Rating label, approved fuel and component configuration", "Burn pot / firepot, air holes and igniter passage",
    "Firebox, ash collection areas and ash disposal condition", "Heat exchanger, baffles and internal exhaust passages",
    "Combustion blower, housing and accessible impeller", "Distribution blower and circulation passages",
    "Hopper, fines, feed mechanism and drop tube", "Door, glass, ash pan / hopper seals and latches",
    "Temperature / flame sensor condition and connections"]),
  notes("accessLimits", "Cleaning access limits and components not removed: item and reason"),
]), section("venting", "Pellet venting and functional tests", [
  ...checks("P", 10, ["Accessible vent / liner, joints, supports and cleanouts", "Termination, cap and combustion air path",
    "Chimney connection, access and remaining deposits", "Hearth, appliance / vent clearances and heat damage",
    "Wiring, grounding and visible electrical condition", "Ignition, pellet feed and stable burn at required settings",
    "Combustion and distribution blower operation", "Safety switches / sensors tested per model procedure",
    "Normal shutdown and exhaust clearing cycle", "Panels / baffles / seals restored; final smoke leak check"]),
  text("safetyTestMethod", "Safety test method / devices tested"),
]), section("measurements", "Measurements and settings", [
  ...testSetup(), notes("testConditions", "Test state / firing setting / vent configuration"),
  ...readings([["draftLow", "Draft / firebox pressure at low (where applicable)"], ["draftHigh", "Draft / firebox pressure at high (where applicable)"],
    ["voltage", "Supply voltage under load (where applicable)"], ["feedSetting", "Feed / trim / temperature setting"],
    ["otherTest", "Other model-specific test (where applicable)"]]),
  notes("additionalReadings", "Extra readings: test point, operating state, units and criterion / manual reference"),
]), section("cleaningResult", "Cleaning result and room air observations", [
  notes("ventCleaning", "Vent / exhaust sections cleaned and method"), notes("remainingDeposits", "Remaining deposits or inaccessible sections"),
  text("cleaningReference", "Cleaning photo / finding ID"), ...alarms(true),
]), ...completion()];

const accessAreas = [
  ["appliances", "Appliances and connectors"], ["exterior", "Chimney exterior"], ["firebox", "Firebox / smoke chamber"],
  ["flues", "Flue interiors / all flues"], ["roof", "Roof / termination"], ["attic", "Attic / concealed-space access"],
  ["basement", "Basement / crawlspace"], ["other", "Other accessible areas"],
];
const woodSections = [visit(), section("chimney", "Chimney identification", [
  text("chimneyId", "Chimney ID / location", true), text("totalFlues", "Total flues", true), text("buildingUse", "Building use"),
  text("manualRevision", "Manuals / revisions"), text("codeReference", "Applicable NFPA 211 edition / local code"),
]), section("inspectionBasis", "Requested work and inspection basis", [
  ...[["applianceService", "Appliance service"], ["chimneyCleaning", "Chimney cleaning"], ["inspectionOnly", "Inspection only"],
    ["followUp", "Follow-up"]].map(([id, label]) => recorded(`work_${id}`, `Requested work: ${label}`)),
  ...[["routine", "Routine / unchanged use"], ["change", "Appliance or fuel change"], ["transfer", "Property transfer"],
    ["relining", "Relining"], ["event", "Chimney fire / other event"], ["damage", "Malfunction / suspected damage"],
    ["other", "Other"]].map(([id, label]) => recorded(`reason_${id}`, `Reason: ${label}`)),
  text("reasonOther", "Other inspection reason"), notes("complaint", "Complaint, event history, last service and reported changes"),
  select("inspectionLevelIndicated", "Inspection level indicated", ["1", "2", "Further investigation needed"]),
  notes("inspectionBasis", "Inspection level basis", true),
  select("inspectionPerformed", "Inspection performed", ["Level 1", "Level 2", "Limited / incomplete"]),
  select("scopeStatus", "Inspection status", ["Recorded scope complete", "Incomplete; limitations and next steps documented"]),
]), section("inventory", "System inventory", [
  select("chimneyType", "Chimney", ["Masonry", "Factory built", "Other"]), text("chimneyOther", "Other chimney type"),
  text("chimneyListing", "Chimney make / model / listing"),
  ...[1, 2, 3].flatMap((n) => [text(`flue${n}_id`, `Inventory ${n} - flue ID`, n === 1),
    text(`flue${n}_appliance`, `Inventory ${n} - connected appliance and location`, n === 1),
    text(`flue${n}_equipment`, `Inventory ${n} - make / model / serial`), text(`flue${n}_liner`, `Inventory ${n} - liner type / size`)]),
  notes("additionalFlues", "Additional flues / appliances, locations, make / model / serial, liner type / size and supporting record IDs"),
]), section("scope", "Access and scope record", [
  ...accessAreas.flatMap(([id, label]) => [select(`access_${id}`, label, ["I", "NA", "NI"]),
    notes(`access_${id}_notes`, `${label} - NI reason / scope exclusion (at least 10 characters)`)]),
  notes("accessLimits", "Access limits, reason, client refusal and effect on inspection"),
]), section("condition", "Wood appliance and chimney condition", checks("W", 1, [
  "Appliance label, approved chimney and component match", "Stove / insert body, firebrick, baffles and catalyst if fitted",
  "Door, glass, seals, controls, screens and accessories", "Masonry firebox, joints and signs of heat damage",
  "Hearth / extension, support and visible combustibles below", "Smoke chamber, smoke shelf and accessible surfaces",
  "Damper, ash dump and cleanout closures", "Connector, thimble, joints, slope and support",
  "Liner material, joints, offsets and visible deterioration", "Unused openings, other flue connections and separations",
  "Chimney support, firestops, shields and insulation provisions", "Chimney / connector separation from combustibles",
  "Crown / chase cover, cap, flashing and exterior condition", "Termination height / location and obstructions",
  "Combustion air, smoke staining and moisture evidence",
])), section("measurements", "Measurements and governing references", [
  ...[["openingFlue", "Opening width / height; flue size / height"], ["hearth", "Hearth extension front / sides / protection"],
    ["mantel", "Mantel / trim height and projection"], ["clearances", "Appliance / connector / chimney clearances"],
    ["termination", "Roof / nearby structure termination measurements"], ["other", "Other / flue ID / attachment ID"]]
    .flatMap(([id, label]) => [text(`measure_${id}_actual`, `${label} - actual and units`),
      text(`measure_${id}_required`, `${label} - required / reference`)]),
  text("measurementReferences", "Measured locations, photos or dimension sketch IDs"),
]), section("cleaning", "Cleaning performed", [
  ...["photos", "video", "writtenNotes"].map((id) => recorded(`precleaning_${id}`, `Precleaning condition documented: ${id === "writtenNotes" ? "written notes" : id}`)),
  text("precleaningIds", "Precleaning documentation IDs"),
  ...[["soot", "Loose soot"], ["flaky", "Flaky creosote"], ["glazed", "Glazed / tar-like"], ["ash", "Ash"],
    ["debris", "Debris / blockage"]].map(([id, label]) => recorded(`deposits_${id}`, `Deposits: ${label}`)),
  text("depositExtent", "Initial depth / extent and locations"), text("depositFlueIds", "Deposit flue / appliance IDs"),
  ...[["flue", "Flue"], ["connector", "Connector"], ["smokeChamber", "Smoke chamber"], ["smokeShelf", "Smoke shelf"],
    ["firebox", "Firebox / appliance"], ["cap", "Cap"]].map(([id, label]) => recorded(`cleaned_${id}`, `Cleaned: ${label}`)),
  notes("cleaningMethod", "Method / equipment and sections cleaned"),
  notes("remainingDeposits", "Remaining deposits / obstruction and locations"),
  notes("uncleanedSections", "Uncleaned sections, reasons and additional work needed"),
]), section("scan", "Internal flue scan and evidence", [
  select("scan", "Internal flue scan", ["Performed", "Not performed"]), notes("scanReason", "Scan not performed: reason"),
  text("scanDevice", "Scan device / method"), text("scanOperator", "Scan operator"),
  ...[1, 2, 3].flatMap((n) => [text(`scan${n}_flueId`, `Scan ${n} - flue ID`), notes(`scan${n}_coverage`, `Scan ${n} - coverage and limitations`),
    notes(`scan${n}_defects`, `Scan ${n} - defects / locations`), text(`scan${n}_files`, `Scan ${n} - photo / video file IDs`)]),
  notes("additionalScans", "Additional scan records by flue ID: coverage / limitations, defects / locations, photo / video IDs"),
  notes("scanFindings", "Observed liner / joint condition, cracks, gaps, deposits or other significant findings"),
]), section("reassembly", "Reassembly and operational observations", [
  recorded("closuresRestored", "Components / closures restored"), recorded("componentsSecured", "Baffles / catalyst / connector secured"),
  recorded("areaCleaned", "Area cleaned"), select("operationCheck", "Operation / draft check", ["Performed", "Not performed"]),
  notes("operationConditions", "Operation / draft check conditions / method or reason not performed"),
  notes("operationResult", "Operation / draft check result / measurements / reference"), ...alarms(false),
  notes("furtherInvestigation", "Additional investigation or specialist referral needed, including concealed areas"),
]), ...completion()];

function template(id: Fuel, title: string, sections: Template["sections"], extra: Template["photoSlots"]): Template {
  return { id, version: 1, title, sections, photoSlots: [
    { id: "overview", label: "Appliance / system overview", required: true },
    { id: "before", label: "Condition before work", required: true },
    { id: "after", label: "Completed condition after work", required: true },
    { id: "label", label: "Rating / identification plate (document exception if absent or inaccessible)", required: true },
    ...extra,
    ...sections.flatMap((s) => s.fields.filter((f) => f.type === "condition").map((f) => ({
      id: f.id, label: `Defect evidence: ${f.label}`, required: false,
    }))),
  ] };
}

// Based on GS-01, PS-01 and WS-01 masters, revision 2026-09-09. No default answers or test limits.
export const serviceTemplates: Record<Fuel, Template> = {
  gas: template("gas", "Gas Service", gasSections, [
    { id: "firebox", label: "Firebox / burner / media after cleaning", required: true },
    { id: "reassembled", label: "Reassembled appliance", required: true },
    { id: "flame", label: "Operating flame, only when safe and within scope", required: false },
  ]),
  pellet: template("pellet", "Pellet Service", pelletSections, [
    { id: "burnPotBefore", label: "Burn pot / firebox before cleaning", required: true },
    { id: "burnPotAfter", label: "Burn pot / firebox after cleaning", required: true },
    { id: "exhaust", label: "Serviced exhaust / cleanout areas", required: true },
    { id: "reassembled", label: "Final assembly", required: true },
    { id: "operation", label: "Operating condition, only when safe and within scope", required: false },
  ]),
  wood: template("wood", "Wood Service and Chimney Inspection", woodSections, [
    { id: "firebox", label: "Firebox / appliance", required: true },
    { id: "termination", label: "Accessible chimney / termination, only when safely accessible", required: false },
    { id: "flue", label: "Flue / camera evidence with flue ID and recorded scope", required: false },
  ]),
};

export function getServiceTemplate(fuel: Fuel): Template {
  if (fuel !== "gas" && fuel !== "wood" && fuel !== "pellet") throw new Error("Unsupported service report fuel");
  return serviceTemplates[fuel];
}
