import { IntentCategory } from "./intentClassifier";

export type ManualTypePolicy = {
  intent: IntentCategory;
  requiredTypes: string[];
  disallowedPrimaryTypes: string[];
  installCritical: boolean;
  strategy: string;
};

const INSTALL_CRITICAL = new Set<IntentCategory>([
  "framing",
  "venting",
  "clearances",
  "gas pressure",
  "electrical",
  "code compliance",
]);

export function isInstallCriticalIntent(intent: IntentCategory) {
  return INSTALL_CRITICAL.has(intent);
}

export function policyForIntent(intent: IntentCategory): ManualTypePolicy {
  if (["framing", "venting", "clearances", "gas pressure", "electrical", "code compliance", "installation steps"].includes(intent)) {
    return {
      intent,
      requiredTypes: ["installation", "service", "wiring"],
      disallowedPrimaryTypes: ["flyer", "brochure", "spec sheet"],
      installCritical: true,
      strategy: "install_manual_required",
    };
  }
  if (intent === "replacement parts") {
    return {
      intent,
      requiredTypes: ["parts", "service", "other"],
      disallowedPrimaryTypes: ["flyer", "brochure"],
      installCritical: false,
      strategy: "parts_manual_preferred",
    };
  }
  if (["troubleshooting", "remote operation"].includes(intent)) {
    return {
      intent,
      requiredTypes: ["owner", "service", "installation"],
      disallowedPrimaryTypes: ["flyer", "brochure"],
      installCritical: false,
      strategy: "owner_allowed",
    };
  }
  return {
    intent,
    requiredTypes: ["installation", "owner", "service", "other"],
    disallowedPrimaryTypes: ["flyer", "brochure"],
    installCritical: false,
    strategy: "default",
  };
}
