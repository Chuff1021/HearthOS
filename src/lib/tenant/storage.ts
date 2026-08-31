import "server-only";

import { requireTenantContext } from "@/lib/tenant/context";

export function isTenantStorageEnabled() {
  return process.env.MULTITENANT_STORAGE_ENABLED === "true";
}

export function isTenantFileStorageEnabled() {
  return process.env.MULTITENANT_FILES_ENABLED === "true" || isTenantStorageEnabled();
}

export async function resolveStorageOrgId(explicitOrgId?: string | null) {
  if (!isTenantStorageEnabled()) return explicitOrgId || null;
  const context = await requireTenantContext();
  if (explicitOrgId && explicitOrgId !== context.orgId && !context.isPlatformAdmin) {
    throw new Error("Cross-organization storage access was denied.");
  }
  return explicitOrgId || context.orgId;
}

export function requireTenantDatabase(databaseAvailable: boolean) {
  if (isTenantStorageEnabled() && !databaseAvailable) {
    throw new Error("Tenant storage requires DATABASE_URL; shared file fallback is disabled.");
  }
}
