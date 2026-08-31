import "server-only";

import {
  requirePermission,
  requireTenantContext,
  TenantAccessError,
} from "@/lib/tenant/context";
import type { Permission } from "@/lib/tenant/permissions";
import {
  featuresForOrganization,
  type OrganizationFeature,
} from "@/lib/tenant/features";

export async function requireOrganizationFeature(
  feature: OrganizationFeature,
  permission?: Permission,
) {
  const context = permission
    ? await requirePermission(permission)
    : await requireTenantContext();

  if (!featuresForOrganization(context.organization)[feature]) {
    throw new TenantAccessError(
      "This feature is not available for your organization.",
      403,
      "organization_feature_unavailable",
    );
  }

  return context;
}
