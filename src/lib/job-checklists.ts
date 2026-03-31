export type ChecklistFieldType = "checkbox" | "text" | "textarea" | "pass-fail" | "measurement" | "select" | "rating";

export type ChecklistField = {
  id: string;
  label: string;
  type: ChecklistFieldType;
  required?: boolean;
  placeholder?: string;
  customerFacing?: boolean; // show on customer report (default true)
  unit?: string; // for measurement fields (e.g., "mV", "ppm", "in. WC")
  options?: string[]; // for select fields
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
  isInstall?: boolean; // install checklists get simpler report format
  sections: ChecklistSection[];
};

export type ChecklistForm = {
  templateId: string;
  values: Record<string, string | boolean>;
  customerName?: string;
  technicianName?: string;
  customerSignature?: string;
  signedAt?: string;
  updatedAt?: string;
};

// ════════════════════════════════════════════════════
// GAS SERVICE / INSPECTION
// ════════════════════════════════════════════════════

const gasServiceTemplate: ChecklistTemplate = {
  id: "gas-service",
  title: "Gas Fireplace Service & Inspection",
  subtitle: "Comprehensive gas appliance inspection per NFPA 54",
  reportTitle: "Gas Fireplace Inspection Report",
  sections: [
    {
      id: "site-conditions",
      title: "Site / Unit Information",
      fields: [
        { id: "gas-line-installed-yes", label: "Gas line to home installed at fire-up: Yes", type: "checkbox" },
        { id: "gas-line-installed-no", label: "Gas line to home installed at fire-up: No", type: "checkbox" },
        { id: "fuel-ng", label: "Fuel Type: Natural Gas", type: "checkbox" },
        { id: "fuel-lp", label: "Fuel Type: LP", type: "checkbox" },
        { id: "termination-horizontal", label: "Termination: Horizontal", type: "checkbox" },
        { id: "termination-vertical", label: "Termination: Vertical", type: "checkbox" },
        { id: "termination-insert", label: "Termination: Insert Termination", type: "checkbox" },
        { id: "termination-stubbed-intake", label: "Termination: Stubbed Intake", type: "checkbox" },
        { id: "termination-full-intake", label: "Termination: Full Intake", type: "checkbox" },
        { id: "termination-highwind-cap", label: "Termination: High Wind Cap", type: "checkbox" },
        { id: "termination-prairie-cap", label: "Termination: Prairie Cap", type: "checkbox" },
        { id: "installer-info", label: "Installer Information", type: "text", placeholder: "Name or company" },
      ],
    },
    {
      id: "venting-exterior",
      title: "Venting & Exterior Inspection",
      fields: [
        { id: "vent-cap-condition", label: "Vent termination cap condition (intact, no nests/debris)", type: "pass-fail", customerFacing: true },
        { id: "vent-clearances", label: "Vent termination clearances to windows/doors/intakes", type: "pass-fail", customerFacing: true },
        { id: "vent-connections", label: "Vent pipe connections tight and sealed", type: "pass-fail", customerFacing: true },
        { id: "vent-slope", label: "Vent pipe slope correct", type: "pass-fail", customerFacing: true },
        { id: "vent-clearance-combustibles", label: "Vent pipe clearance to combustibles", type: "pass-fail", customerFacing: true },
        { id: "vent-corrosion", label: "No visible corrosion or discoloration on vent pipe", type: "pass-fail", customerFacing: true },
        { id: "air-intake-clear", label: "Concentric air intake screen clear of debris", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "actions-install",
      title: "Actions Performed (Installation / Prep)",
      fields: [
        { id: "paint-touch-up", label: "Painted surfaces - touch up completed", type: "checkbox" },
        { id: "tack-vacuum", label: "Tack cloth & vacuum valve/heat exchange", type: "checkbox" },
        { id: "fireback-install", label: "Fireback(s) installed", type: "checkbox" },
        { id: "fire-art-placed", label: "Fire-Art placed (logs/driftwood/stones)", type: "checkbox" },
        { id: "ember-material", label: "Ember material / crushed glass placed", type: "checkbox" },
        { id: "glass-clean-gasket", label: "Glass cleaned & gasket checked", type: "checkbox", required: true },
        { id: "protective-coating-removed", label: "Protective coating removed", type: "checkbox" },
        { id: "lp-conversion-verified", label: "LP conversion verified (if applicable)", type: "checkbox" },
        { id: "digital-photos-taken", label: "Digital photos taken", type: "checkbox", required: true },
      ],
    },
    {
      id: "firebox-inspection",
      title: "Firebox & Interior Inspection",
      fields: [
        { id: "glass-condition", label: "Glass panel condition (no cracks, chips, proper seal)", type: "pass-fail", required: true, customerFacing: true },
        { id: "glass-gasket", label: "Glass gasket/seal integrity", type: "pass-fail", customerFacing: true },
        { id: "refractory-condition", label: "Refractory panels / fire brick condition", type: "pass-fail", customerFacing: true },
        { id: "log-placement", label: "Log set placement per manufacturer diagram", type: "pass-fail", customerFacing: true },
        { id: "burner-condition", label: "Burner condition (no blockage, corrosion)", type: "pass-fail", customerFacing: true },
        { id: "flame-pattern", label: "Burner flame pattern — even and consistent", type: "pass-fail", customerFacing: true },
        { id: "soot-check", label: "No excessive soot or carbon buildup in firebox", type: "pass-fail", customerFacing: true },
        { id: "convection-passages", label: "Convection air passages clear of debris", type: "pass-fail" },
      ],
    },
    {
      id: "gas-fire-up",
      title: "Gas Turn-On & Ignition",
      fields: [
        { id: "ipi-tested", label: "IPI (Intermittent Pilot) tested", type: "checkbox" },
        { id: "cpi-tested", label: "CPI (Continuous Pilot) tested", type: "checkbox" },
        { id: "standing-pilot-tested", label: "Standing pilot tested", type: "checkbox" },
        { id: "wall-switch-tested", label: "Wall switch tested", type: "checkbox" },
        { id: "fan-tested", label: "Fan/blower tested", type: "checkbox" },
        { id: "remote-tested", label: "Remote control tested", type: "checkbox" },
        { id: "gas-leak-check", label: "Gas leak check performed — all connections", type: "pass-fail", required: true, customerFacing: true },
        { id: "exhaust-leak-check", label: "Exhaust leak detection performed", type: "pass-fail", required: true, customerFacing: true },
        { id: "restrictor-adjusted", label: "Intake/exhaust restrictor adjusted", type: "checkbox" },
        { id: "termination-cap-inspected", label: "Termination cap inspected", type: "checkbox" },
      ],
    },
    {
      id: "measurements",
      title: "Measurements & Readings",
      fields: [
        { id: "pilot-sensor-mv", label: "Pilot sensor / thermocouple reading", type: "measurement", unit: "mV", placeholder: "8-30", customerFacing: false },
        { id: "thermopile-open", label: "Thermopile (open circuit)", type: "measurement", unit: "mV", placeholder: "300-900", customerFacing: true },
        { id: "thermopile-load", label: "Thermopile (under load)", type: "measurement", unit: "mV", placeholder: "150+", customerFacing: true },
        { id: "line-voltage", label: "Line voltage", type: "measurement", unit: "VAC", placeholder: "120" },
        { id: "gas-pressure-incoming", label: "Gas pressure — incoming (static)", type: "measurement", unit: "in. WC", placeholder: "NG: 5-7 / LP: 11-14" },
        { id: "gas-pressure-manifold", label: "Gas pressure — manifold", type: "measurement", unit: "in. WC", placeholder: "Per rating plate" },
        { id: "co-ambient", label: "CO reading — ambient room", type: "measurement", unit: "ppm", placeholder: "0", required: true, customerFacing: true },
        { id: "co-flue", label: "CO reading — at vent/flue", type: "measurement", unit: "ppm", placeholder: "<100", customerFacing: true },
      ],
    },
    {
      id: "safety-clearances",
      title: "Safety & Clearances",
      fields: [
        { id: "gas-shutoff-accessible", label: "Gas shut-off valve present and accessible", type: "pass-fail", customerFacing: true },
        { id: "drip-leg-present", label: "Drip leg / sediment trap present", type: "pass-fail" },
        { id: "clearances-maintained", label: "Clearances to combustibles maintained", type: "pass-fail", customerFacing: true },
        { id: "smoke-co-detector", label: "Smoke/CO detector in room functional", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "customer-care",
      title: "Customer Care & Handoff",
      fields: [
        { id: "remote-operation-shown", label: "Remote operation demonstrated to homeowner", type: "checkbox" },
        { id: "cpi-ipi-explained", label: "CPI/IPI mode explained", type: "checkbox" },
        { id: "maintenance-reviewed", label: "Maintenance & glass cleaning reviewed", type: "checkbox" },
        { id: "battery-replacement-shown", label: "Battery replacement shown", type: "checkbox" },
      ],
    },
    {
      id: "overall-assessment",
      title: "Overall Assessment",
      fields: [
        { id: "system-condition", label: "System condition", type: "rating", required: true, customerFacing: true },
        { id: "safe-for-use", label: "Unit is safe for continued operation", type: "pass-fail", required: true, customerFacing: true },
        { id: "deficiencies", label: "Deficiencies found", type: "textarea", placeholder: "List any issues found...", customerFacing: true },
        { id: "recommendations", label: "Recommendations", type: "textarea", placeholder: "Priority repairs, next service date...", customerFacing: true },
        { id: "parts-replaced", label: "Parts replaced during this visit", type: "textarea", placeholder: "Part numbers and descriptions...", customerFacing: true },
        { id: "service-summary", label: "Service summary / technician notes", type: "textarea", placeholder: "Summary of work performed..." },
        { id: "next-service-date", label: "Recommended next service", type: "text", placeholder: "e.g., March 2027", customerFacing: true },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════
// WOOD FIREPLACE / STOVE SERVICE / INSPECTION / CLEAN
// ════════════════════════════════════════════════════

const woodServiceTemplate: ChecklistTemplate = {
  id: "wood-clean",
  title: "Wood Fireplace / Stove Inspection & Cleaning",
  subtitle: "Chimney, firebox, and appliance inspection per NFPA 211 & CSIA standards",
  reportTitle: "Chimney & Fireplace Inspection Report",
  sections: [
    {
      id: "system-info",
      title: "System Information",
      fields: [
        { id: "chimney-type", label: "Chimney type", type: "select", options: ["Masonry", "Factory-built (metal)", "Hybrid"], customerFacing: true },
        { id: "appliance-type", label: "Appliance type", type: "select", options: ["Open fireplace", "Fireplace insert", "Wood stove", "Cook stove"], customerFacing: true },
        { id: "flue-type", label: "Flue liner type", type: "select", options: ["Clay tile", "Stainless steel liner", "Cast-in-place", "Unlined"], customerFacing: true },
        { id: "inspection-level", label: "Inspection level performed", type: "select", options: ["Level 1", "Level 2", "Level 3"], required: true, customerFacing: true },
        { id: "usage-frequency", label: "Usage frequency", type: "select", options: ["Daily", "Weekly", "Occasional", "Not used this season"] },
      ],
    },
    {
      id: "exterior-chimney",
      title: "Exterior Chimney Inspection",
      fields: [
        { id: "chimney-cap", label: "Chimney cap / rain cap present and functional", type: "pass-fail", required: true, customerFacing: true },
        { id: "spark-arrestor", label: "Spark arrestor screen present and intact", type: "pass-fail", customerFacing: true },
        { id: "chimney-crown", label: "Chimney crown / wash condition", type: "pass-fail", customerFacing: true },
        { id: "masonry-mortar", label: "Masonry mortar joints condition", type: "pass-fail", customerFacing: true },
        { id: "masonry-brick", label: "Brick/stone faces condition (no spalling)", type: "pass-fail", customerFacing: true },
        { id: "flashing-condition", label: "Flashing condition", type: "pass-fail", customerFacing: true },
        { id: "chimney-height", label: "Chimney height meets 3-2-10 rule", type: "pass-fail", required: true, customerFacing: true },
        { id: "chimney-plumb", label: "Chimney plumb and structurally sound", type: "pass-fail", required: true, customerFacing: true },
        { id: "cleanout-door", label: "Cleanout door sealed and functional", type: "pass-fail", customerFacing: true },
        { id: "efflorescence", label: "No water damage / efflorescence (white staining)", type: "pass-fail", customerFacing: true },
        { id: "chase-condition", label: "Chase siding and chase top condition (factory-built)", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "firebox-interior",
      title: "Firebox Interior Inspection",
      fields: [
        { id: "firebox-mortar", label: "Firebox mortar joints condition", type: "pass-fail", required: true, customerFacing: true },
        { id: "firebox-brick", label: "Firebox brick/panel condition", type: "pass-fail", required: true, customerFacing: true },
        { id: "firebox-floor", label: "Firebox floor / hearth condition", type: "pass-fail", customerFacing: true },
        { id: "lintel-bar", label: "Lintel bar / angle iron condition", type: "pass-fail", customerFacing: true },
        { id: "damper-operation", label: "Damper opens/closes fully", type: "pass-fail", required: true, customerFacing: true },
        { id: "damper-plate", label: "Damper plate condition (no warping, cracks, rust)", type: "pass-fail", customerFacing: true },
        { id: "smoke-shelf", label: "Smoke shelf clear of debris/creosote", type: "pass-fail", customerFacing: true },
        { id: "smoke-chamber", label: "Smoke chamber condition — parging intact", type: "pass-fail", customerFacing: true },
        { id: "hearth-extension", label: "Hearth extension meets code (16\" front, 8\" sides min)", type: "pass-fail", customerFacing: true },
        { id: "mantel-clearances", label: "Combustible mantel/surround clearances correct", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "creosote-assessment",
      title: "Creosote & Soot Assessment",
      fields: [
        { id: "creosote-type", label: "Creosote type observed", type: "select", options: ["Stage 1 — Dusty/flaky (easy removal)", "Stage 2 — Flaky/tar-like (harder removal)", "Stage 3 — Glazed/hardened (chimney fire risk)", "None / minimal"], required: true, customerFacing: true },
        { id: "creosote-thickness", label: "Creosote accumulation thickness", type: "text", placeholder: "e.g., 1/16\", 1/8\", 1/4\"", customerFacing: true },
        { id: "chimney-fire-evidence", label: "Evidence of prior chimney fire", type: "pass-fail", required: true, customerFacing: true },
        { id: "soot-removed", label: "Soot/creosote removed (approximate amount)", type: "text", customerFacing: true },
      ],
    },
    {
      id: "stove-insert",
      title: "Stove / Insert Specific (if applicable)",
      description: "Skip if open masonry fireplace",
      fields: [
        { id: "door-gasket", label: "Door gasket seal (dollar bill test)", type: "pass-fail", customerFacing: true },
        { id: "door-glass", label: "Door glass condition", type: "pass-fail", customerFacing: true },
        { id: "door-hinge-latch", label: "Door hinge and latch operation", type: "pass-fail", customerFacing: true },
        { id: "air-controls", label: "Primary/secondary air controls operational", type: "pass-fail", customerFacing: true },
        { id: "catalyst-condition", label: "Catalytic combustor condition (if equipped)", type: "pass-fail", customerFacing: true },
        { id: "catalyst-bypass", label: "Catalyst bypass damper operation", type: "pass-fail", customerFacing: true },
        { id: "baffle-plate", label: "Baffle plate / throat plate condition", type: "pass-fail", customerFacing: true },
        { id: "stovepipe-condition", label: "Stovepipe / connector condition", type: "pass-fail", customerFacing: true },
        { id: "stovepipe-clearance", label: "Stovepipe clearance to combustibles", type: "pass-fail", customerFacing: true },
        { id: "floor-protection", label: "Floor protection adequate", type: "pass-fail", customerFacing: true },
        { id: "blower-operation", label: "Blower/fan operation and cleaning", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "draft-testing",
      title: "Draft & Functional Testing",
      fields: [
        { id: "draft-measurement", label: "Draft measurement", type: "measurement", unit: "in. WC", placeholder: "-0.04 to -0.06", customerFacing: true },
        { id: "smoke-draw", label: "Smoke draw confirmation (smoke pencil test)", type: "pass-fail", customerFacing: true },
        { id: "smoking-staining", label: "No evidence of smoking/staining above opening", type: "pass-fail", customerFacing: true },
        { id: "combustion-air", label: "Adequate combustion air supply to room", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "cleaning-documentation",
      title: "Cleaning Documentation",
      fields: [
        { id: "cleaning-method", label: "Cleaning method", type: "select", options: ["Top-down brushing", "Bottom-up brushing", "Both directions", "Rotary cleaning", "Chemical treatment"] },
        { id: "chemical-treatment", label: "Chemical treatment applied", type: "text", placeholder: "Product name if used", customerFacing: true },
        { id: "before-after-photos", label: "Before/after photos taken", type: "checkbox", required: true },
      ],
    },
    {
      id: "overall-assessment",
      title: "Overall Assessment",
      fields: [
        { id: "system-condition", label: "System condition", type: "rating", required: true, customerFacing: true },
        { id: "safe-for-use", label: "Safe for continued use", type: "pass-fail", required: true, customerFacing: true },
        { id: "deficiencies", label: "Deficiencies found", type: "textarea", placeholder: "List any issues with severity...", customerFacing: true },
        { id: "recommendations", label: "Recommendations", type: "textarea", placeholder: "Priority repairs, next service date...", customerFacing: true },
        { id: "parts-replaced", label: "Parts replaced / work performed", type: "textarea", customerFacing: true },
        { id: "next-service-date", label: "Recommended next inspection/cleaning", type: "text", placeholder: "e.g., Before next heating season", customerFacing: true },
        { id: "tech-notes", label: "Technician notes (internal)", type: "textarea", customerFacing: false },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════
// PELLET STOVE SERVICE
// ════════════════════════════════════════════════════

const pelletServiceTemplate: ChecklistTemplate = {
  id: "pellet-clean",
  title: "Pellet Stove Service & Inspection",
  subtitle: "Comprehensive pellet appliance inspection per NFPA 211",
  reportTitle: "Pellet Stove Inspection Report",
  sections: [
    {
      id: "venting-system",
      title: "Venting System",
      fields: [
        { id: "vent-cap-clear", label: "Vent termination cap condition and clear of debris", type: "pass-fail", required: true, customerFacing: true },
        { id: "vent-clearances", label: "Vent termination clearances per code", type: "pass-fail", customerFacing: true },
        { id: "vent-joints-sealed", label: "Vent pipe joints secure and sealed", type: "pass-fail", customerFacing: true },
        { id: "vent-pipe-condition", label: "Vent pipe condition (no corrosion, soot leaks)", type: "pass-fail", customerFacing: true },
        { id: "vent-slope", label: "Vent pipe slope correct (1/4\" per foot toward stove)", type: "pass-fail", customerFacing: true },
        { id: "vent-combustible-clearance", label: "Vent pipe clearance to combustibles", type: "pass-fail", customerFacing: true },
        { id: "vent-cleaned", label: "Vent pipe cleaned — fly ash/creosote removed", type: "checkbox", required: true, customerFacing: true },
        { id: "fresh-air-intake", label: "Fresh air intake clear and connected", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "combustion-chamber",
      title: "Burn Pot & Combustion Chamber",
      fields: [
        { id: "burn-pot-cleaned", label: "Burn pot removed and cleaned — holes/slots clear", type: "pass-fail", required: true, customerFacing: true },
        { id: "burn-pot-condition", label: "Burn pot condition (no warping, cracking, burn-through)", type: "pass-fail", required: true, customerFacing: true },
        { id: "chamber-cleaned", label: "Combustion chamber walls cleaned of fly ash", type: "checkbox", required: true, customerFacing: true },
        { id: "chamber-condition", label: "Combustion chamber condition", type: "pass-fail", customerFacing: true },
        { id: "heat-exchanger-cleaned", label: "Heat exchanger tubes cleaned (brush through each)", type: "checkbox", required: true, customerFacing: true },
        { id: "ash-traps-cleared", label: "Ash traps / clean-out areas cleared", type: "checkbox", required: true },
        { id: "glass-cleaned", label: "Firebox glass cleaned", type: "checkbox", required: true },
        { id: "glass-gasket-condition", label: "Glass gasket condition", type: "pass-fail", customerFacing: true },
        { id: "door-gasket-seal", label: "Door gasket seal (dollar bill test)", type: "pass-fail", customerFacing: true },
        { id: "door-latch", label: "Door latch operation and adjustment", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "igniter",
      title: "Igniter",
      fields: [
        { id: "igniter-tested", label: "Igniter element tested — heats within spec time", type: "pass-fail", required: true, customerFacing: true },
        { id: "igniter-condition", label: "Igniter element physical condition", type: "pass-fail", customerFacing: true },
        { id: "igniter-resistance", label: "Igniter element resistance", type: "measurement", unit: "Ω", placeholder: "40-100 cold" },
      ],
    },
    {
      id: "fuel-delivery",
      title: "Fuel Delivery System",
      fields: [
        { id: "hopper-cleaned", label: "Hopper cleaned of old pellets and dust", type: "checkbox", required: true, customerFacing: true },
        { id: "hopper-lid-seal", label: "Hopper lid seal / gasket condition", type: "pass-fail", customerFacing: true },
        { id: "hopper-lid-switch", label: "Hopper lid safety switch function", type: "pass-fail", required: true, customerFacing: true },
        { id: "auger-motor", label: "Auger motor operation (smooth, no grinding)", type: "pass-fail", customerFacing: true },
        { id: "auger-condition", label: "Auger tube / chute clear of jams", type: "pass-fail" },
        { id: "pellet-quality", label: "Pellet quality notes", type: "text", placeholder: "Premium/standard, moisture, fines" },
      ],
    },
    {
      id: "air-systems",
      title: "Air Systems",
      fields: [
        { id: "combustion-blower-cleaned", label: "Combustion blower / exhaust fan cleaned", type: "checkbox", required: true, customerFacing: true },
        { id: "combustion-blower-operation", label: "Combustion blower motor operation (smooth, quiet)", type: "pass-fail", customerFacing: true },
        { id: "convection-blower-cleaned", label: "Convection blower / distribution fan cleaned", type: "checkbox", required: true, customerFacing: true },
        { id: "convection-blower-operation", label: "Convection blower operation — all speeds", type: "pass-fail", customerFacing: true },
        { id: "convection-passages", label: "Convection air passages / channels cleaned", type: "checkbox", required: true },
      ],
    },
    {
      id: "electrical-controls",
      title: "Electrical & Controls",
      fields: [
        { id: "control-board-visual", label: "Control board visual inspection (no scorch/corrosion)", type: "pass-fail" },
        { id: "wire-connections", label: "All wire connections secure", type: "pass-fail" },
        { id: "thermostat-function", label: "Thermostat / room sensor function", type: "pass-fail", customerFacing: true },
        { id: "display-panel", label: "Display panel / indicator lights function", type: "pass-fail", customerFacing: true },
        { id: "error-codes", label: "Error code history", type: "text", placeholder: "Any stored error codes" },
        { id: "power-cord", label: "Power cord condition", type: "pass-fail", customerFacing: true },
        { id: "surge-protector", label: "Surge protector recommended and present", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "safety-devices",
      title: "Safety Devices",
      fields: [
        { id: "high-limit", label: "High-limit / overheat snap disc tested", type: "pass-fail", required: true, customerFacing: true },
        { id: "low-limit", label: "Low-limit / proof-of-fire snap disc", type: "pass-fail", customerFacing: true },
        { id: "vacuum-switch", label: "Vacuum / pressure switch function", type: "pass-fail", required: true, customerFacing: true },
        { id: "vacuum-hose", label: "Vacuum switch hose clear and connected", type: "pass-fail" },
        { id: "door-safety-switch", label: "Door safety switch function (if equipped)", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "operational-test",
      title: "Operational Test",
      fields: [
        { id: "startup-sequence", label: "Start-up sequence — complete cycle observed", type: "pass-fail", required: true, customerFacing: true },
        { id: "flame-quality", label: "Flame quality — steady, appropriate color", type: "pass-fail", customerFacing: true },
        { id: "clinker-tendency", label: "Clinker formation tendency", type: "pass-fail", customerFacing: true },
        { id: "shutdown-sequence", label: "Shutdown sequence — normal burnout observed", type: "pass-fail", customerFacing: true },
        { id: "co-vent", label: "CO reading at vent termination", type: "measurement", unit: "ppm", placeholder: "<100", customerFacing: true },
        { id: "co-room", label: "CO reading in living space", type: "measurement", unit: "ppm", placeholder: "0", required: true, customerFacing: true },
        { id: "smoke-spillage", label: "No smoke spillage at door/glass seal", type: "pass-fail", customerFacing: true },
      ],
    },
    {
      id: "clearances",
      title: "Clearances & Installation",
      fields: [
        { id: "clearances-all-sides", label: "Clearances to combustibles — all sides", type: "pass-fail", customerFacing: true },
        { id: "floor-protection", label: "Floor protection adequate", type: "pass-fail", customerFacing: true },
        { id: "outlet-accessible", label: "Electrical outlet accessible (not behind unit)", type: "pass-fail" },
      ],
    },
    {
      id: "overall-assessment",
      title: "Overall Assessment",
      fields: [
        { id: "system-condition", label: "System condition", type: "rating", required: true, customerFacing: true },
        { id: "safe-for-use", label: "Safe for continued use", type: "pass-fail", required: true, customerFacing: true },
        { id: "deficiencies", label: "Deficiencies found", type: "textarea", placeholder: "List any issues...", customerFacing: true },
        { id: "recommendations", label: "Recommendations", type: "textarea", placeholder: "Priority repairs, next service...", customerFacing: true },
        { id: "parts-replaced", label: "Parts replaced / work performed", type: "textarea", customerFacing: true },
        { id: "next-service-date", label: "Recommended next service", type: "text", placeholder: "e.g., Before next heating season", customerFacing: true },
        { id: "tech-notes", label: "Technician notes (internal)", type: "textarea", customerFacing: false },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════
// FIREPLACE INSTALLATION (ALL FUEL TYPES)
// ════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════

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
      values[field.id] = field.type === "checkbox" || field.type === "pass-fail" ? false : "";
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
