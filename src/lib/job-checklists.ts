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
      id: "actions-performed",
      title: "Actions Performed",
      fields: [
        { id: "inspect-exterior", label: "Inspected appliance exterior and firebox", type: "checkbox", required: true },
        { id: "verify-clearances", label: "Verified clearances and general safety", type: "checkbox", required: true },
        { id: "check-venting", label: "Checked venting / vent restrictor / cap condition", type: "checkbox", required: true },
        { id: "test-controls", label: "Tested controls, switch, remote, and blower operation", type: "checkbox", required: true },
        { id: "leak-check", label: "Performed gas leak check", type: "checkbox", required: true },
        { id: "clean-glass", label: "Cleaned glass, ember area, and visible debris", type: "checkbox" },
      ],
    },
    {
      id: "gas-turned-on",
      title: "Actions Performed If Gas Was Turned On",
      fields: [
        { id: "pilot-verified", label: "Verified pilot ignition and flame carryover", type: "checkbox", required: true },
        { id: "burner-verified", label: "Verified burner ignition and flame appearance", type: "checkbox", required: true },
        { id: "media-placement", label: "Verified logs / media / ember placement", type: "checkbox", required: true },
        { id: "air-shutter", label: "Adjusted air shutter / flame picture as needed", type: "checkbox" },
        { id: "fan-operation", label: "Verified fan and circulation operation", type: "checkbox" },
      ],
    },
    {
      id: "measurements",
      title: "Measurements",
      description: "Enter readings exactly as checked in the field.",
      fields: [
        { id: "inlet-pressure-hi", label: "Inlet Pressure High", type: "text", placeholder: 'ex: 7.0" WC' },
        { id: "inlet-pressure-lo", label: "Inlet Pressure Low", type: "text", placeholder: 'ex: 5.5" WC' },
        { id: "manifold-pressure-hi", label: "Manifold Pressure High", type: "text", placeholder: 'ex: 3.5" WC' },
        { id: "manifold-pressure-lo", label: "Manifold Pressure Low", type: "text", placeholder: 'ex: 1.6" WC' },
        { id: "co-reading", label: "CO Reading", type: "text", placeholder: "ex: 12 ppm" },
        { id: "draft-reading", label: "Draft / spill reading", type: "text", placeholder: "ex: within spec" },
      ],
    },
    {
      id: "customer-care",
      title: "Customer Operation & Care Instructions",
      fields: [
        { id: "demo-startup", label: "Demonstrated startup / shutdown procedure", type: "checkbox", required: true },
        { id: "demo-remote", label: "Reviewed remote / wall switch operation", type: "checkbox", required: true },
        { id: "demo-maintenance", label: "Reviewed maintenance / cleaning expectations", type: "checkbox", required: true },
        { id: "manual-left", label: "Confirmed manual / literature left with customer", type: "checkbox" },
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
