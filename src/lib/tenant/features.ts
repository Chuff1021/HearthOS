export const AARONS_ORGANIZATION_SLUG = "default";

export type OrganizationFeature = "meeksPortal" | "gabe" | "gabeAudit";

export type OrganizationFeatures = Record<OrganizationFeature, boolean>;

const NO_RESTRICTED_FEATURES: OrganizationFeatures = {
  meeksPortal: false,
  gabe: false,
  gabeAudit: false,
};

export function isAaronsOrganization(organization: { slug: string }) {
  return organization.slug === AARONS_ORGANIZATION_SLUG;
}

export function featuresForOrganization(organization: { slug: string }): OrganizationFeatures {
  if (!isAaronsOrganization(organization)) return NO_RESTRICTED_FEATURES;

  return {
    meeksPortal: true,
    gabe: true,
    gabeAudit: true,
  };
}
