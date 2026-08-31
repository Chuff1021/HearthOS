import { NextResponse } from "next/server";
import {
  requireTenantContext,
  tenantErrorResponse,
} from "@/lib/tenant/context";
import { featuresForOrganization } from "@/lib/tenant/features";

export async function GET() {
  try {
    const context = await requireTenantContext();
    return NextResponse.json({
      organization: {
        id: context.organization.id,
        name: context.organization.name,
        slug: context.organization.slug,
        logoUrl: context.organization.logoUrl,
        timezone: context.organization.timezone,
        onboardingStatus: context.organization.onboardingStatus,
      },
      membership: {
        id: context.membershipId,
        role: context.role,
        permissions: [...context.permissions],
      },
      identity: {
        id: context.identityId,
        email: context.email,
        isPlatformAdmin: context.isPlatformAdmin,
      },
      features: featuresForOrganization(context.organization),
      source: context.source,
    });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json(
      { error: "Unable to resolve organization context." },
      { status: 500 },
    );
  }
}
