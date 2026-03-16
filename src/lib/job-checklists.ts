export type ChecklistFieldType = "checkbox" | "text" | "textarea";

export type ChecklistField = {
  id: string;
  label: string;
  type: ChecklistFieldType;
  required?: boolean;
  placeholder?: string;
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

const gasServiceTemplate: ChecklistTemplate = {
  id: "gas-service",
  title: "Gas Fire-Up / Service Checklist",
  subtitle: "Startup, inspection, measurements, and customer handoff",
  sections: [
    {
      id: "site-conditions",
      title: "Site / Installation Conditions",
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
        { id: "termination-high-wind", label: "Termination: High Wind Cap", type: "checkbox" },
        { id: "termination-prairie-cap", label: "Termination: Prairie Cap", type: "checkbox" },
        { id: "gas-line-installed-by", label: "Gas line installed by", type: "text", placeholder: "Installer / plumber / builder" },
      ],
    },
    {
      id: "actions-performed",
      title: "Actions Performed",
      fields: [
        { id: "touched-up-painted-surfaces", label: "Touched up painted surfaces", type: "checkbox", required: true },
        { id: "tack-clothed-appliance", label: "Tack clothed appliance thoroughly and vacuumed valve / heat exchange area", type: "checkbox", required: true },
        { id: "installed-firebacks", label: "Installed firebacks properly", type: "checkbox", required: true },
        { id: "installed-fire-art", label: "Installed interior Fire-Art properly (logs / driftwood / stones)", type: "checkbox", required: true },
        { id: "installed-ember-material", label: "Installed ember material or crushed glass properly", type: "checkbox", required: true },
        { id: "cleaned-remounted-glass", label: "Cleaned and remounted glass; checked gasket for complete seal", type: "checkbox", required: true },
        { id: "removed-protective-coatings", label: "Removed protective coatings and labels on glass / plated surfaces", type: "checkbox", required: true },
        { id: "verified-lp-conversion", label: "Verified LP conversion was done properly (if applicable)", type: "checkbox" },
        { id: "took-digital-photos", label: "Took digital photos of installation, unit, and vent termination", type: "checkbox", required: true },
      ],
    },
    {
      id: "gas-turned-on",
      title: "Actions Performed If Gas Was Turned On",
      fields: [
        { id: "tested-ipi-cpi-standing-pilot", label: "Lit and tested unit in IPI, CPI, and Standing Pilot modes as applicable", type: "checkbox", required: true },
        { id: "checked-wall-switch-fan-remote", label: "Checked wall switch, fan, and remote for proper operation", type: "checkbox", required: true },
        { id: "checked-gas-exhaust-leaks", label: "Checked for gas and exhaust leaks around glass and gas connections", type: "checkbox", required: true },
        { id: "adjusted-intake-exhaust-restrictors", label: "Adjusted intake and exhaust restrictors to maximize performance", type: "checkbox", required: true },
        { id: "inspected-termination-cap", label: "Visually inspected termination cap for proper installation and obstructions", type: "checkbox", required: true },
        { id: "confirmed-termination-brand", label: "Confirmed termination cap is the required brand", type: "checkbox", required: true },
      ],
    },
    {
      id: "measurements",
      title: "Measurements",
      description: "Enter readings exactly as checked in the field.",
      fields: [
        { id: "pilot-sensor-tone-yes", label: "Pilot Sensor Continuity Tone Test (FPL): Yes", type: "checkbox" },
        { id: "pilot-sensor-tone-no", label: "Pilot Sensor Continuity Tone Test (FPL): No", type: "checkbox" },
        { id: "measurement-1-polarity-ground", label: "1. Checked proper polarity and ground to appliance", type: "text", placeholder: "Result / notes" },
        { id: "measurement-2-line-volts", label: "2. Household line voltage to appliance", type: "text", placeholder: "Volts" },
        { id: "measurement-3-module-dc-volts", label: "3. Module DC volts for IPI systems (FPL)", type: "text", placeholder: "DC volts" },
        { id: "measurement-4-receiver-dc-volts", label: "4. Receiver / regulator modulation DC volts (Radiant only)", type: "text", placeholder: "DC volts" },
        { id: "measurement-5-outgoing-high", label: "5. Outgoing Gas Pressure High (WCI)", type: "text", placeholder: 'ex: 3.5" WC' },
        { id: "measurement-5-outgoing-low", label: "5. Outgoing Gas Pressure Low (WCI)", type: "text", placeholder: 'ex: 1.7" WC' },
        { id: "measurement-6-incoming-alone", label: "6. Incoming Gas Pressure - unit alone", type: "text", placeholder: 'ex: 7.0" WC' },
        { id: "measurement-6-incoming-loaded", label: "6. Incoming Gas Pressure - with other appliances on", type: "text", placeholder: 'ex: 6.2" WC' },
        { id: "appliance-hearth-1", label: "Appliance / Hearth #1", type: "text" },
        { id: "appliance-hearth-2", label: "Appliance / Hearth #2", type: "text" },
        { id: "appliance-hearth-3", label: "Appliance / Hearth #3", type: "text" },
        { id: "appliance-hearth-4", label: "Appliance / Hearth #4", type: "text" },
        { id: "appliance-hearth-5", label: "Appliance / Hearth #5", type: "text" },
        { id: "appliance-hearth-6", label: "Appliance / Hearth #6", type: "text" },
        { id: "wci-reading", label: "WCI reading notes", type: "text", placeholder: "Combined WCI notes" },
      ],
    },
    {
      id: "customer-care",
      title: "Customer Operation & Care Instructions",
      fields: [
        { id: "instructed-remote-operation", label: "Instructed customer on remote operation", type: "checkbox", required: true },
        { id: "explained-cpi", label: "Explained when CPI mode is used", type: "checkbox", required: true },
        { id: "explained-ipi", label: "Explained when IPI / GreenSmart mode is used", type: "checkbox", required: true },
        { id: "reviewed-maintenance-battery", label: "Reviewed maintenance and battery replacement vs dealer service", type: "checkbox", required: true },
        { id: "recommended-continuous-pilot", label: "Reviewed continuous pilot recommendation below 40°F", type: "checkbox" },
        { id: "reviewed-continuous-pilot-benefits", label: "Reviewed benefits of Continuous Pilot / Winter Mode", type: "checkbox" },
      ],
    },
    {
      id: "gas-appliances",
      title: "Gas Burning Appliances in Home",
      fields: [
        { id: "gas-appliance-list", label: "List all gas burning appliances (including patio items)", type: "textarea", placeholder: "Fireplace, range, water heater, furnace, patio heater, etc." },
      ],
    },
    {
      id: "notes",
      title: "Technician Notes",
      fields: [
        { id: "service-summary", label: "Service Summary", type: "textarea", placeholder: "Describe work performed, concerns found, and any follow-up needed." },
        { id: "parts-needed", label: "Parts / follow-up needed", type: "textarea", placeholder: "List parts, recommendations, or return trip items." },
      ],
    },
  ],
};

const gasInstallTemplate: ChecklistTemplate = {
  id: "gas-install",
  title: "Gas Installation Checklist",
  subtitle: "Installation-ready placeholder template",
  sections: [
    {
      id: "install-core",
      title: "Core Installation Steps",
      fields: [
        { id: "unit-verified", label: "Verified appliance model and order details", type: "checkbox", required: true },
        { id: "vent-installed", label: "Installed venting system per manufacturer specs", type: "checkbox", required: true },
        { id: "gas-line-installed", label: "Installed and leak-tested gas line", type: "checkbox", required: true },
        { id: "startup-complete", label: "Completed startup and customer walkthrough", type: "checkbox", required: true },
      ],
    },
  ],
};

const woodCleanTemplate: ChecklistTemplate = {
  id: "wood-clean",
  title: "Wood Service Checklist",
  subtitle: "Wood-burning cleaning/service placeholder template",
  sections: [
    {
      id: "wood-core",
      title: "Cleaning & Inspection",
      fields: [
        { id: "sweep-complete", label: "Sweep / clean completed", type: "checkbox", required: true },
        { id: "cap-inspected", label: "Cap and crown inspected", type: "checkbox", required: true },
        { id: "firebox-inspected", label: "Firebox and refractory inspected", type: "checkbox", required: true },
      ],
    },
  ],
};

const pelletCleanTemplate: ChecklistTemplate = {
  id: "pellet-clean",
  title: "Pellet Service Checklist",
  subtitle: "Pellet cleaning/service placeholder template",
  sections: [
    {
      id: "pellet-core",
      title: "Cleaning & Inspection",
      fields: [
        { id: "hopper-cleaned", label: "Hopper and feed system cleaned", type: "checkbox", required: true },
        { id: "burn-pot-cleaned", label: "Burn pot and combustion path cleaned", type: "checkbox", required: true },
        { id: "sensors-checked", label: "Sensors, igniter, and blower checked", type: "checkbox", required: true },
      ],
    },
  ],
};

export const checklistTemplates: Record<string, ChecklistTemplate> = {
  "gas-service": gasServiceTemplate,
  "gas-install": gasInstallTemplate,
  "wood-clean": woodCleanTemplate,
  "pellet-clean": pelletCleanTemplate,
};

export function getChecklistTemplate(id: string) {
  return checklistTemplates[id] || gasServiceTemplate;
}

export function inferChecklistTemplateId(job: { jobType?: string; fireplaceType?: string; title?: string }) {
  const type = String(job.jobType || "").toLowerCase();
  const fireplaceType = String(job.fireplaceType || "").toLowerCase();
  const title = String(job.title || "").toLowerCase();

  if (fireplaceType.includes("pellet")) return "pellet-clean";
  if (fireplaceType.includes("wood")) return "wood-clean";
  if (type.includes("install") || title.includes("install")) return "gas-install";
  return "gas-service";
}

export function buildInitialChecklistForm(templateId: string): ChecklistForm {
  const template = getChecklistTemplate(templateId);
  const values: Record<string, string | boolean> = {};
  template.sections.forEach((section) => {
    section.fields.forEach((field) => {
      values[field.id] = field.type === "checkbox" ? false : "";
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
    return field.type === "checkbox" ? Boolean(value) : String(value || "").trim().length > 0;
  }).length;
  const total = requiredFields.length;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
