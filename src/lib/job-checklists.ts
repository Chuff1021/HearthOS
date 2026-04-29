export type ChecklistFieldType =
  | "checkbox"
  | "text"
  | "textarea"
  | "pass-fail"
  | "measurement"
  | "select"
  | "radio"
  | "multiselect"
  | "rating";

export type ChecklistField = {
  id: string;
  label: string;
  type: ChecklistFieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string; // small helper line under the label
  customerFacing?: boolean; // show on customer report (default true)
  unit?: string; // for measurement fields (e.g., "mV", "ppm", "in. WC")
  options?: string[]; // for select / radio / multiselect
};

export type ChecklistSection = {
  id: string;
  title: string;
  description?: string;
  fields: ChecklistField[];
};

export type ChecklistTemplate = {
  id: string;
  title: string;
  subtitle: string;
  reportTitle?: string; // title on customer-facing report
  isInstall?: boolean; // install checklists get a simpler report format
  sections: ChecklistSection[];
};

export type ChecklistForm = {
  templateId: string;
  // multiselect values are stored as a single string with the "|" delimiter
  // so the form payload can keep the simple Record<string, string|boolean> shape.
  values: Record<string, string | boolean>;
  customerName?: string;
  technicianName?: string;
  customerSignature?: string;
  signedAt?: string;
  updatedAt?: string;
};

// ──────────────────────────────────────────────────────────────────────────
// GAS FIREPLACE — service & inspection (NFPA 54 / NFI gas standards)
// ──────────────────────────────────────────────────────────────────────────

const gasServiceTemplate: ChecklistTemplate = {
  id: "gas-service",
  title: "Gas Fireplace Service & Inspection",
  subtitle: "Comprehensive gas appliance inspection per NFPA 54 / NFI standards",
  reportTitle: "Gas Fireplace Inspection Report",
  sections: [
    {
      id: "setup",
      title: "Job Setup",
      fields: [
        { id: "unit-make-model", label: "Make / model captured", type: "text", placeholder: "e.g., Heat & Glo SL-7T", customerFacing: true },
        { id: "fuel-type", label: "Fuel type", type: "radio", options: ["Natural Gas", "Liquid Propane"], required: true, customerFacing: true },
        { id: "ignition-system", label: "Ignition system", type: "radio", options: ["Standing pilot (CPI)", "Intermittent pilot (IPI)", "Electronic / direct-spark"], required: true, customerFacing: true },
        { id: "termination-style", label: "Vent termination", type: "multiselect", options: ["Horizontal", "Vertical", "Insert termination", "Concentric intake", "Stubbed intake", "High-wind cap", "Prairie cap"], customerFacing: true },
        { id: "last-service", label: "Last service date (per customer/sticker)", type: "text", placeholder: "e.g., 2024-10 or 'unknown'" },
      ],
    },
    {
      id: "exterior-vent",
      title: "Exterior & Venting",
      description: "Inspect the termination and the entire vent run from outside.",
      fields: [
        { id: "vent-cap-condition", label: "Vent termination cap intact (no nests/debris)", type: "pass-fail", required: true, customerFacing: true },
        { id: "vent-clearances", label: "Termination clearances to windows / doors / intakes", type: "pass-fail", required: true, customerFacing: true },
        { id: "vent-joints", label: "Vent pipe joints tight, sealed, and supported", type: "pass-fail", customerFacing: true },
        { id: "vent-slope", label: "Vent pipe slope and run within manufacturer limits", type: "pass-fail", customerFacing: true },
        { id: "vent-clearance-combustibles", label: "Vent clearance to combustibles maintained", type: "pass-fail", customerFacing: true },
        { id: "air-intake-clear", label: "Concentric air intake screen clear", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "firebox",
      title: "Firebox & Interior",
      fields: [
        { id: "glass-condition", label: "Glass panel — no cracks / chips / proper seal", type: "pass-fail", required: true, customerFacing: true },
        { id: "glass-gasket", label: "Glass gasket integrity", type: "pass-fail", customerFacing: true },
        { id: "refractory-condition", label: "Refractory panels / firebrick condition", type: "pass-fail", customerFacing: true },
        { id: "log-placement", label: "Log set / media placed per manufacturer diagram", type: "pass-fail", required: true, customerFacing: true },
        { id: "burner-condition", label: "Burner — no blockage, corrosion, or rust-through", type: "pass-fail", customerFacing: true },
        { id: "flame-pattern", label: "Burner flame pattern — even, no impingement", type: "pass-fail", required: true, customerFacing: true },
        { id: "soot-check", label: "No excessive soot / carbon buildup", type: "pass-fail", customerFacing: true },
        { id: "firebox-vacuumed", label: "Firebox vacuumed / cleaned this visit", type: "checkbox", required: true, customerFacing: true },
      ],
    },
    {
      id: "gas-system",
      title: "Gas System & Safety",
      fields: [
        { id: "gas-leak-check", label: "Gas leak check — every connection, electronic detector", type: "pass-fail", required: true, customerFacing: true },
        { id: "gas-shutoff-accessible", label: "Gas shut-off valve present and accessible", type: "pass-fail", required: true, customerFacing: true },
        { id: "drip-leg-present", label: "Drip leg / sediment trap installed", type: "pass-fail", customerFacing: true },
        { id: "gas-pressure-incoming", label: "Incoming (static) gas pressure", type: "measurement", unit: "in. WC", placeholder: "NG: 5–7 / LP: 11–14", required: true, customerFacing: true },
        { id: "gas-pressure-manifold", label: "Manifold pressure (per rating plate)", type: "measurement", unit: "in. WC", placeholder: "Per rating plate", required: true, customerFacing: true },
        { id: "clearances-maintained", label: "Combustible clearances maintained around unit", type: "pass-fail", required: true, customerFacing: true },
      ],
    },
    {
      id: "ignition-function",
      title: "Ignition & Function Test",
      fields: [
        { id: "ignition-success", label: "Pilot / ignition lights cleanly on first attempt", type: "pass-fail", required: true, customerFacing: true },
        { id: "thermopile-open", label: "Thermopile output — open circuit", type: "measurement", unit: "mV", placeholder: "300–900", customerFacing: true },
        { id: "thermopile-load", label: "Thermopile output — under load", type: "measurement", unit: "mV", placeholder: "150+", customerFacing: true },
        { id: "thermocouple-mv", label: "Thermocouple reading (standing pilot only)", type: "measurement", unit: "mV", placeholder: "8–30", customerFacing: false },
        { id: "controls-tested", label: "Controls tested", type: "multiselect", options: ["Wall switch", "Thermostat", "Remote control", "App / smart control"], customerFacing: true },
        { id: "fan-tested", label: "Fan / blower runs cleanly on all speeds", type: "pass-fail", customerFacing: true },
        { id: "burner-cycles", label: "Burner cycles cleanly (high / low / off)", type: "pass-fail", required: true, customerFacing: true },
      ],
    },
    {
      id: "co-test",
      title: "CO Test",
      description: "Run a calibrated CO meter for at least 5 minutes after the unit reaches operating temperature.",
      fields: [
        { id: "co-ambient", label: "Ambient room CO", type: "measurement", unit: "ppm", placeholder: "Target: 0", required: true, customerFacing: true },
        { id: "co-flue", label: "Flue / vent CO", type: "measurement", unit: "ppm", placeholder: "Target: <100", required: true, customerFacing: true },
        { id: "exhaust-leak-check", label: "No exhaust leakage at vent connections", type: "pass-fail", required: true, customerFacing: true },
      ],
    },
    {
      id: "detectors-photos",
      title: "Detectors & Documentation",
      fields: [
        { id: "smoke-co-detector", label: "Working smoke + CO detector in the room", type: "pass-fail", required: true, customerFacing: true },
        { id: "before-photo", label: "Before-service photo captured", type: "checkbox", required: true },
        { id: "after-photo", label: "After-service photo captured", type: "checkbox", required: true, customerFacing: true },
        { id: "rating-plate-photo", label: "Rating plate / data sticker photographed", type: "checkbox" },
      ],
    },
    {
      id: "findings",
      title: "Findings, Recommendations & Customer Care",
      fields: [
        { id: "system-condition", label: "Overall system condition", type: "rating", required: true, customerFacing: true },
        { id: "safe-for-use", label: "Unit is safe for continued operation", type: "pass-fail", required: true, customerFacing: true },
        { id: "deficiencies", label: "Deficiencies found", type: "textarea", placeholder: "List anything that didn't pass, with severity…", customerFacing: true },
        { id: "recommendations", label: "Recommendations", type: "textarea", placeholder: "Priority repairs, parts to replace, return-visit needs…", customerFacing: true },
        { id: "parts-replaced", label: "Parts replaced this visit", type: "textarea", placeholder: "Part numbers + descriptions", customerFacing: true },
        { id: "customer-walkthrough", label: "Operation walkthrough completed with homeowner", type: "checkbox", required: true, customerFacing: true },
        { id: "next-service-date", label: "Recommended next service", type: "text", placeholder: "e.g., March 2027 / before next heating season", customerFacing: true },
        { id: "tech-notes", label: "Technician notes (internal only)", type: "textarea", placeholder: "Things you want the next tech to know — not shown to the customer", customerFacing: false },
      ],
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────
// WOOD FIREPLACE / STOVE — inspection & cleaning (NFPA 211 / CSIA)
// ──────────────────────────────────────────────────────────────────────────

const woodServiceTemplate: ChecklistTemplate = {
  id: "wood-clean",
  title: "Wood Fireplace / Stove Inspection & Cleaning",
  subtitle: "Chimney + appliance inspection per NFPA 211 and CSIA",
  reportTitle: "Chimney & Wood Appliance Inspection Report",
  sections: [
    {
      id: "setup",
      title: "Job Setup",
      fields: [
        { id: "inspection-level", label: "Inspection level performed", type: "radio", options: ["Level 1 — readily accessible portions", "Level 2 — accessible + camera/scope", "Level 3 — requires removal of components"], required: true, customerFacing: true, hint: "Per NFPA 211 standard. Most annual cleanings are Level 2." },
        { id: "appliance-type", label: "Appliance type", type: "radio", options: ["Open masonry fireplace", "Fireplace insert", "Free-standing wood stove", "Wood cook stove"], required: true, customerFacing: true },
        { id: "chimney-type", label: "Chimney type", type: "radio", options: ["Masonry", "Factory-built (metal)", "Hybrid"], required: true, customerFacing: true },
        { id: "flue-type", label: "Flue liner type", type: "radio", options: ["Clay tile", "Stainless steel liner", "Cast-in-place", "Unlined", "Unknown"], customerFacing: true },
        { id: "usage-frequency", label: "Usage frequency (per customer)", type: "radio", options: ["Daily", "Weekly", "Occasional", "Not used this season"], customerFacing: true },
        { id: "last-cleaned", label: "When was the chimney last cleaned?", type: "text", placeholder: "e.g., last fall / 2 yrs ago / never", customerFacing: true },
      ],
    },
    {
      id: "exterior-chimney",
      title: "Exterior Chimney",
      description: "Inspect from the roof and the ground.",
      fields: [
        { id: "chimney-cap", label: "Chimney cap / rain cap intact", type: "pass-fail", required: true, customerFacing: true },
        { id: "spark-arrestor", label: "Spark arrestor screen present and intact", type: "pass-fail", customerFacing: true },
        { id: "chimney-crown", label: "Crown / chase top condition (no cracks, spalling)", type: "pass-fail", required: true, customerFacing: true },
        { id: "masonry-mortar", label: "Mortar joints sound", type: "pass-fail", customerFacing: true },
        { id: "masonry-brick", label: "Brick / stone — no spalling or efflorescence", type: "pass-fail", customerFacing: true },
        { id: "flashing-condition", label: "Flashing watertight at roof", type: "pass-fail", customerFacing: true },
        { id: "chimney-height", label: "Chimney height meets the 3-2-10 rule", type: "pass-fail", required: true, customerFacing: true },
        { id: "chimney-plumb", label: "Chimney plumb and structurally sound", type: "pass-fail", required: true, customerFacing: true },
      ],
    },
    {
      id: "firebox-damper",
      title: "Firebox & Damper",
      fields: [
        { id: "firebox-mortar", label: "Firebox mortar joints", type: "pass-fail", required: true, customerFacing: true },
        { id: "firebox-brick", label: "Firebox brick / refractory panels", type: "pass-fail", required: true, customerFacing: true },
        { id: "damper-operation", label: "Damper opens and closes fully", type: "pass-fail", required: true, customerFacing: true },
        { id: "damper-plate", label: "Damper plate condition (no warp, rust-through)", type: "pass-fail", customerFacing: true },
        { id: "smoke-shelf", label: "Smoke shelf clear of debris / creosote", type: "pass-fail", customerFacing: true },
        { id: "smoke-chamber", label: "Smoke chamber parging intact", type: "pass-fail", customerFacing: true },
        { id: "hearth-extension", label: "Hearth extension meets code (≥16\" front, ≥8\" sides)", type: "pass-fail", required: true, customerFacing: true },
        { id: "mantel-clearances", label: "Combustible mantel / surround clearances correct", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "flue-creosote",
      title: "Flue Inspection & Creosote",
      fields: [
        { id: "flue-method", label: "Inspection method", type: "radio", options: ["Visual only", "Camera / scope", "Visual + camera"], required: true, customerFacing: true },
        { id: "creosote-stage", label: "Creosote stage observed", type: "radio", options: ["None / minimal", "Stage 1 — dusty / flaky", "Stage 2 — flaky / tar-like", "Stage 3 — glazed (chimney-fire risk)"], required: true, customerFacing: true },
        { id: "creosote-thickness", label: "Approximate accumulation", type: "text", placeholder: "e.g., 1/16\" / 1/8\" / 1/4\"", customerFacing: true },
        { id: "chimney-fire-evidence", label: "Evidence of a prior chimney fire", type: "pass-fail", required: true, customerFacing: true },
        { id: "soot-removed", label: "Approximate soot / creosote removed", type: "text", placeholder: "e.g., 1/2 gallon, 2 quarts", customerFacing: true },
      ],
    },
    {
      id: "stove-insert",
      title: "Stove / Insert (skip for open masonry)",
      description: "Skip if the appliance is an open masonry fireplace.",
      fields: [
        { id: "door-gasket", label: "Door gasket — dollar-bill test", type: "pass-fail", customerFacing: true },
        { id: "door-glass", label: "Door glass condition", type: "pass-fail", customerFacing: true },
        { id: "air-controls", label: "Primary / secondary air controls operational", type: "pass-fail", customerFacing: true },
        { id: "catalyst-condition", label: "Catalytic combustor (if equipped)", type: "pass-fail", customerFacing: true },
        { id: "baffle-plate", label: "Baffle / throat plate condition", type: "pass-fail", customerFacing: true },
        { id: "stovepipe-condition", label: "Stovepipe / connector condition + clearance", type: "pass-fail", customerFacing: true },
        { id: "blower-operation", label: "Blower / fan operation cleaned", type: "pass-fail", customerFacing: true },
        { id: "floor-protection", label: "Floor protection adequate", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "cleaning",
      title: "Cleaning Performed",
      fields: [
        { id: "cleaning-method", label: "Cleaning method", type: "radio", options: ["Top-down brushing", "Bottom-up brushing", "Both directions", "Rotary cleaning", "Not cleaned this visit"], required: true, customerFacing: true },
        { id: "chemical-treatment", label: "Chemical treatment applied (optional)", type: "text", placeholder: "Product if used", customerFacing: true },
        { id: "before-photo", label: "Before-cleaning photo captured", type: "checkbox", required: true },
        { id: "after-photo", label: "After-cleaning photo captured", type: "checkbox", required: true, customerFacing: true },
      ],
    },
    {
      id: "draft-function",
      title: "Draft & Function",
      fields: [
        { id: "draft-measurement", label: "Draft measurement", type: "measurement", unit: "in. WC", placeholder: "Target: -0.04 to -0.06", customerFacing: true },
        { id: "smoke-draw", label: "Smoke pencil — clean draw", type: "pass-fail", customerFacing: true },
        { id: "smoke-spillage", label: "No smoke spillage above opening", type: "pass-fail", required: true, customerFacing: true },
        { id: "combustion-air", label: "Adequate combustion air supply", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "findings",
      title: "Findings, Recommendations & Customer Care",
      fields: [
        { id: "system-condition", label: "Overall system condition", type: "rating", required: true, customerFacing: true },
        { id: "safe-for-use", label: "Safe for continued use", type: "pass-fail", required: true, customerFacing: true },
        { id: "deficiencies", label: "Deficiencies found", type: "textarea", placeholder: "List anything that didn't pass, with severity…", customerFacing: true },
        { id: "recommendations", label: "Recommendations", type: "textarea", placeholder: "Priority repairs, return-visit needs…", customerFacing: true },
        { id: "parts-replaced", label: "Parts replaced / work performed", type: "textarea", customerFacing: true },
        { id: "customer-walkthrough", label: "Operation walkthrough completed with homeowner", type: "checkbox", required: true, customerFacing: true },
        { id: "next-service-date", label: "Recommended next inspection / cleaning", type: "text", placeholder: "e.g., before next heating season", customerFacing: true },
        { id: "tech-notes", label: "Technician notes (internal only)", type: "textarea", customerFacing: false },
      ],
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────
// PELLET STOVE — service & inspection (NFPA 211)
// ──────────────────────────────────────────────────────────────────────────

const pelletServiceTemplate: ChecklistTemplate = {
  id: "pellet-clean",
  title: "Pellet Stove Service & Inspection",
  subtitle: "Comprehensive pellet appliance inspection per NFPA 211",
  reportTitle: "Pellet Stove Inspection Report",
  sections: [
    {
      id: "setup",
      title: "Job Setup",
      fields: [
        { id: "unit-make-model", label: "Make / model captured", type: "text", placeholder: "e.g., Harman P43", customerFacing: true },
        { id: "vent-type", label: "Vent type", type: "radio", options: ["3\" pellet vent (PL)", "4\" pellet vent (PL)", "B-vent w/ adapter", "Other"], required: true, customerFacing: true },
        { id: "last-service", label: "Last service date (per customer/sticker)", type: "text", placeholder: "e.g., 2024-11 or 'unknown'" },
        { id: "pellet-quality", label: "Pellet quality observed", type: "radio", options: ["Premium hardwood", "Standard / softwood", "Excessive fines", "Damp / damaged"], customerFacing: true },
      ],
    },
    {
      id: "burn-pot",
      title: "Burn Pot & Combustion Chamber",
      description: "All cleaned items are required for a complete service.",
      fields: [
        { id: "burn-pot-cleaned", label: "Burn pot removed and cleaned — all holes / slots clear", type: "pass-fail", required: true, customerFacing: true },
        { id: "burn-pot-condition", label: "Burn pot condition (no warping, cracking, burn-through)", type: "pass-fail", required: true, customerFacing: true },
        { id: "chamber-cleaned", label: "Combustion chamber walls cleaned of fly ash", type: "checkbox", required: true, customerFacing: true },
        { id: "heat-exchanger-cleaned", label: "Heat exchanger tubes brushed", type: "checkbox", required: true, customerFacing: true },
        { id: "ash-traps-cleared", label: "Ash traps / clean-out areas cleared", type: "checkbox", required: true, customerFacing: true },
        { id: "glass-cleaned", label: "Firebox glass cleaned", type: "checkbox", required: true, customerFacing: true },
        { id: "door-gasket-seal", label: "Door + glass gasket — dollar-bill test", type: "pass-fail", required: true, customerFacing: true },
      ],
    },
    {
      id: "venting",
      title: "Venting",
      fields: [
        { id: "vent-cap-clear", label: "Vent termination cap clear and intact", type: "pass-fail", required: true, customerFacing: true },
        { id: "vent-clearances", label: "Vent termination clearances per code", type: "pass-fail", customerFacing: true },
        { id: "vent-joints-sealed", label: "Vent pipe joints sealed and supported", type: "pass-fail", customerFacing: true },
        { id: "vent-slope", label: "Vent pipe slope correct (1/4\" per ft toward stove)", type: "pass-fail", customerFacing: true },
        { id: "vent-pipe-cleaned", label: "Vent pipe cleaned of fly ash / creosote", type: "checkbox", required: true, customerFacing: true },
        { id: "fresh-air-intake", label: "Fresh air intake clear and connected", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "fuel-delivery",
      title: "Fuel Delivery",
      fields: [
        { id: "hopper-cleaned", label: "Hopper cleaned of old pellets / dust", type: "checkbox", required: true, customerFacing: true },
        { id: "hopper-lid-switch", label: "Hopper lid safety switch tested", type: "pass-fail", required: true, customerFacing: true },
        { id: "hopper-lid-seal", label: "Hopper lid seal / gasket condition", type: "pass-fail", customerFacing: true },
        { id: "auger-motor", label: "Auger motor smooth — no grinding", type: "pass-fail", required: true, customerFacing: true },
        { id: "auger-condition", label: "Auger tube clear of jams", type: "pass-fail" },
      ],
    },
    {
      id: "air-systems",
      title: "Air Systems",
      fields: [
        { id: "combustion-blower-cleaned", label: "Combustion / exhaust blower cleaned", type: "checkbox", required: true, customerFacing: true },
        { id: "combustion-blower-operation", label: "Combustion blower runs smooth and quiet", type: "pass-fail", required: true, customerFacing: true },
        { id: "convection-blower-cleaned", label: "Convection / distribution blower cleaned", type: "checkbox", required: true, customerFacing: true },
        { id: "convection-blower-operation", label: "Convection blower — all speeds tested", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "igniter-safety",
      title: "Igniter & Safety Devices",
      fields: [
        { id: "igniter-tested", label: "Igniter heats within manufacturer time spec", type: "pass-fail", required: true, customerFacing: true },
        { id: "igniter-resistance", label: "Igniter resistance (cold)", type: "measurement", unit: "Ω", placeholder: "40–100", customerFacing: false },
        { id: "high-limit", label: "High-limit / overheat snap disc tested", type: "pass-fail", required: true, customerFacing: true },
        { id: "vacuum-switch", label: "Vacuum / pressure switch function", type: "pass-fail", required: true, customerFacing: true },
        { id: "door-safety-switch", label: "Door safety switch tested (if equipped)", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "operational-test",
      title: "Operational Test",
      fields: [
        { id: "startup-sequence", label: "Start-up sequence — full cycle observed", type: "pass-fail", required: true, customerFacing: true },
        { id: "flame-quality", label: "Flame quality — steady, proper color", type: "pass-fail", required: true, customerFacing: true },
        { id: "shutdown-sequence", label: "Shutdown sequence — normal burnout", type: "pass-fail", customerFacing: true },
        { id: "co-room", label: "Ambient room CO", type: "measurement", unit: "ppm", placeholder: "Target: 0", required: true, customerFacing: true },
        { id: "co-vent", label: "CO at vent termination", type: "measurement", unit: "ppm", placeholder: "Target: <100", customerFacing: true },
        { id: "smoke-spillage", label: "No smoke spillage at door / glass seal", type: "pass-fail", required: true, customerFacing: true },
      ],
    },
    {
      id: "detectors-photos",
      title: "Detectors & Documentation",
      fields: [
        { id: "smoke-co-detector", label: "Working smoke + CO detector in the room", type: "pass-fail", required: true, customerFacing: true },
        { id: "before-photo", label: "Before-service photo captured", type: "checkbox", required: true },
        { id: "after-photo", label: "After-service photo captured", type: "checkbox", required: true, customerFacing: true },
      ],
    },
    {
      id: "findings",
      title: "Findings, Recommendations & Customer Care",
      fields: [
        { id: "system-condition", label: "Overall system condition", type: "rating", required: true, customerFacing: true },
        { id: "safe-for-use", label: "Safe for continued use", type: "pass-fail", required: true, customerFacing: true },
        { id: "deficiencies", label: "Deficiencies found", type: "textarea", placeholder: "List anything that didn't pass, with severity…", customerFacing: true },
        { id: "recommendations", label: "Recommendations", type: "textarea", placeholder: "Priority repairs, parts to replace…", customerFacing: true },
        { id: "parts-replaced", label: "Parts replaced this visit", type: "textarea", customerFacing: true },
        { id: "customer-walkthrough", label: "Operation walkthrough completed with homeowner", type: "checkbox", required: true, customerFacing: true },
        { id: "next-service-date", label: "Recommended next service", type: "text", placeholder: "e.g., before next heating season", customerFacing: true },
        { id: "tech-notes", label: "Technician notes (internal only)", type: "textarea", customerFacing: false },
      ],
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────
// FIREPLACE INSTALLATION (all fuel types) — preserved as-is
// ──────────────────────────────────────────────────────────────────────────

const installTemplate: ChecklistTemplate = {
  id: "gas-install",
  title: "Fireplace Installation Checklist",
  subtitle: "Comprehensive installation verification — all fuel types",
  reportTitle: "Installation Completion Report",
  isInstall: true,
  sections: [
    {
      id: "pre-install",
      title: "Pre-Installation",
      fields: [
        { id: "permit-pulled", label: "Permit pulled and posted", type: "pass-fail", required: true },
        { id: "manual-on-site", label: "Manufacturer installation manual on site", type: "pass-fail", required: true },
        { id: "listing-verified", label: "Unit listing / certification label verified", type: "pass-fail", required: true },
        { id: "framing-dimensions", label: "Framing dimensions match manufacturer specs", type: "pass-fail", required: true },
        { id: "framing-width", label: "Framing width", type: "measurement", unit: "in." },
        { id: "framing-height", label: "Framing height", type: "measurement", unit: "in." },
        { id: "framing-depth", label: "Framing depth", type: "measurement", unit: "in." },
        { id: "header-support", label: "Header support adequate for unit weight", type: "pass-fail", required: true },
        { id: "floor-support", label: "Floor support / load-bearing adequate", type: "pass-fail", required: true },
        { id: "firestop-installed", label: "Non-combustible firestop at penetrations", type: "pass-fail", required: true },
      ],
    },
    {
      id: "gas-supply",
      title: "Gas Supply (Gas Units Only)",
      description: "Skip for wood/pellet installations",
      fields: [
        { id: "gas-line-size", label: "Gas line properly sized for BTU demand", type: "pass-fail" },
        { id: "gas-line-material", label: "Gas line material approved (per local code)", type: "pass-fail" },
        { id: "gas-pressure-test", label: "Gas line pressure tested", type: "pass-fail" },
        { id: "gas-shutoff", label: "Gas shut-off valve within 6' and accessible", type: "pass-fail", required: true },
        { id: "drip-leg", label: "Drip leg / sediment trap installed", type: "pass-fail" },
        { id: "gas-connector", label: "Gas connection — approved connector or hard pipe", type: "pass-fail" },
        { id: "gas-leak-test", label: "Gas connection leak tested", type: "pass-fail", required: true },
      ],
    },
    {
      id: "vent-install",
      title: "Vent / Chimney Installation",
      fields: [
        { id: "vent-correct-type", label: "Vent components correct brand/model for unit", type: "pass-fail", required: true },
        { id: "vent-joints-connected", label: "Vent joints properly connected and locked", type: "pass-fail", required: true },
        { id: "vent-joints-sealed", label: "Vent joints sealed per manufacturer", type: "pass-fail", required: true },
        { id: "vent-slope-correct", label: "Vent slope correct", type: "pass-fail", required: true },
        { id: "vent-clearance", label: "Vent clearance to combustibles at all points", type: "pass-fail", required: true },
        { id: "firestops-penetrations", label: "Firestops at every floor/ceiling penetration", type: "pass-fail", required: true },
        { id: "vent-support", label: "Vent support per manufacturer intervals", type: "pass-fail" },
        { id: "vent-total-length", label: "Total equivalent vent length within limits", type: "pass-fail" },
        { id: "termination-location", label: "Vent termination at correct location/height", type: "pass-fail", required: true },
        { id: "termination-clearances", label: "Termination clearances to windows/doors/intakes", type: "pass-fail", required: true },
        { id: "storm-collar-flashing", label: "Storm collar and flashing installed (roof)", type: "pass-fail" },
      ],
    },
    {
      id: "unit-install",
      title: "Unit Installation & Finishing",
      fields: [
        { id: "unit-level-plumb", label: "Unit level and plumb in opening", type: "pass-fail", required: true },
        { id: "unit-secured", label: "Unit secured per manufacturer instructions", type: "pass-fail", required: true },
        { id: "electrical-connection", label: "Electrical connection per NEC and manufacturer", type: "pass-fail" },
        { id: "surround-material", label: "Surround / facing material non-combustible or listed", type: "pass-fail" },
        { id: "mantel-clearances", label: "Mantel clearances verified against manufacturer specs", type: "pass-fail" },
        { id: "media-installed", label: "Media installed per manufacturer diagram (logs/glass/stones)", type: "pass-fail" },
        { id: "refractory-positioned", label: "Refractory panels properly positioned", type: "pass-fail" },
        { id: "glass-installed", label: "Glass panel properly installed with clips/gasket", type: "pass-fail" },
        { id: "blower-installed", label: "Blower/fan installed and wired", type: "pass-fail" },
        { id: "controls-wired", label: "Remote/switch/thermostat wired and tested", type: "pass-fail" },
      ],
    },
    {
      id: "final-testing",
      title: "Final Testing & Commissioning",
      fields: [
        { id: "gas-supply-pressure", label: "Gas supply pressure verified", type: "measurement", unit: "in. WC" },
        { id: "manifold-pressure", label: "Manifold pressure set per rating plate", type: "measurement", unit: "in. WC" },
        { id: "final-leak-check", label: "All gas connections final leak check", type: "pass-fail", required: true },
        { id: "ignition-success", label: "Ignition sequence successful", type: "pass-fail", required: true },
        { id: "pilot-flame", label: "Pilot flame proper — sensor engulfment", type: "pass-fail" },
        { id: "thermopile-output", label: "Thermopile output", type: "measurement", unit: "mV" },
        { id: "burner-flame", label: "Main burner flame pattern proper and even", type: "pass-fail" },
        { id: "co-ambient", label: "CO reading — ambient room", type: "measurement", unit: "ppm", placeholder: "0", required: true },
        { id: "co-vent", label: "CO reading — at vent", type: "measurement", unit: "ppm", placeholder: "<100" },
        { id: "all-modes-tested", label: "All operating modes tested (high/low/thermostat)", type: "pass-fail" },
        { id: "fan-operation", label: "Fan operation — all speeds", type: "pass-fail" },
        { id: "all-controls", label: "All controls functional (remote/switch/thermostat)", type: "pass-fail" },
        { id: "clearances-final", label: "Clearances — final verification all around", type: "pass-fail", required: true },
        { id: "surface-temp-test", label: "Combustible surface temp check after 1 hr (<117°F)", type: "pass-fail" },
        { id: "smoke-co-detector", label: "Smoke/CO detector in room functional", type: "pass-fail" },
      ],
    },
    {
      id: "customer-handoff",
      title: "Customer Walkthrough & Documentation",
      fields: [
        { id: "customer-walkthrough", label: "Customer operation walkthrough completed", type: "checkbox", required: true },
        { id: "manual-left", label: "Installation manual and documentation left with customer", type: "checkbox", required: true },
        { id: "warranty-registered", label: "Warranty registration completed", type: "checkbox" },
        { id: "inspection-scheduled", label: "AHJ inspection scheduled (if required)", type: "checkbox" },
        { id: "install-notes", label: "Installation notes", type: "textarea", placeholder: "Any notes about the installation..." },
        { id: "follow-up-needed", label: "Follow-up items needed", type: "textarea", placeholder: "Parts on order, return visits, etc." },
      ],
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────
// EXPORTS
// ──────────────────────────────────────────────────────────────────────────

export const checklistTemplates: Record<string, ChecklistTemplate> = {
  "gas-service": gasServiceTemplate,
  "gas-install": installTemplate,
  "wood-clean": woodServiceTemplate,
  "pellet-clean": pelletServiceTemplate,
};

export function getChecklistTemplate(id: string) {
  return checklistTemplates[id] || gasServiceTemplate;
}

export function inferChecklistTemplateId(job: { jobType?: string; fireplaceType?: string; title?: string }) {
  const type = String(job.jobType || "").toLowerCase();
  const fireplaceType = String(job.fireplaceType || "").toLowerCase();
  const title = String(job.title || "").toLowerCase();

  if (type.includes("install") || title.includes("install")) return "gas-install";
  if (type.includes("pellet") || fireplaceType.includes("pellet") || title.includes("pellet")) return "pellet-clean";
  if (type.includes("wood") || fireplaceType.includes("wood") || title.includes("wood") || title.includes("chimney") || title.includes("sweep") || type.includes("cleaning")) return "wood-clean";
  return "gas-service";
}

export function buildInitialChecklistForm(templateId: string): ChecklistForm {
  const template = getChecklistTemplate(templateId);
  const values: Record<string, string | boolean> = {};
  template.sections.forEach((section) => {
    section.fields.forEach((field) => {
      values[field.id] =
        field.type === "checkbox" || field.type === "pass-fail" ? false : "";
    });
  });
  return {
    templateId: template.id,
    values,
  };
}

export function checklistCompletion(form: ChecklistForm | null | undefined) {
  if (!form) return { completed: 0, total: 0, percent: 0 };
  const template = getChecklistTemplate(form.templateId);
  const requiredFields = template.sections.flatMap((section) => section.fields).filter((field) => field.required);
  const completed = requiredFields.filter((field) => {
    const value = form.values[field.id];
    if (field.type === "checkbox" || field.type === "pass-fail") return Boolean(value);
    return String(value || "").trim().length > 0;
  }).length;
  const total = requiredFields.length;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

// Helpers for the new "multiselect" field type — values stored as a
// "|"-delimited string so the existing Record<string, string|boolean> shape
// still works.
export function multiselectValueToArray(v: string | boolean | undefined): string[] {
  if (!v || typeof v !== "string") return [];
  return v.split("|").map((s) => s.trim()).filter(Boolean);
}

export function arrayToMultiselectValue(arr: string[]): string {
  return arr.filter(Boolean).join("|");
}
