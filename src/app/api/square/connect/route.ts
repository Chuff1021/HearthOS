import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/integrations/store";
import { requirePermission, tenantErrorResponse } from "@/lib/tenant/context";

function oauthBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com/oauth2"
    : "https://connect.squareup.com/oauth2";
}

export async function GET() {
  try {
    const context = await requirePermission("integrations:manage");
    const applicationId = process.env.SQUARE_APPLICATION_ID;
    const redirectUri = process.env.SQUARE_REDIRECT_URI;
    if (!applicationId || !redirectUri || !context.identityId) {
      return NextResponse.json({ error: "Square OAuth is not configured." }, { status: 503 });
    }
    const state = await createOAuthState({
      provider: "square",
      orgId: context.orgId,
      identityId: context.identityId,
      redirectPath: "/onboarding?step=payments",
    });
    const url = new URL(`${oauthBaseUrl()}/authorize`);
    url.searchParams.set("client_id", applicationId);
    url.searchParams.set("scope", [
      "MERCHANT_PROFILE_READ",
      "PAYMENTS_READ",
      "PAYMENTS_WRITE",
      "ORDERS_READ",
      "ORDERS_WRITE",
      "CUSTOMERS_READ",
      "ITEMS_READ",
    ].join(" "));
    url.searchParams.set("state", state);
    return NextResponse.redirect(url);
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: "Failed to start Square connection" }, { status: 500 });
  }
}
