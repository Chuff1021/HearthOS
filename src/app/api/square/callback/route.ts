import { NextRequest, NextResponse } from "next/server";
import { consumeOAuthState, saveIntegrationConnection } from "@/lib/integrations/store";

function squareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const denied = request.nextUrl.searchParams.get("error");
  if (denied) return NextResponse.redirect(new URL(`/onboarding?step=payments&square=${encodeURIComponent(denied)}`, request.url));
  if (!code || !state) return NextResponse.redirect(new URL("/onboarding?step=payments&square=missing_params", request.url));

  try {
    const oauthState = await consumeOAuthState("square", state);
    if (!oauthState) {
      return NextResponse.redirect(new URL("/onboarding?step=payments&square=invalid_state", request.url));
    }
    const applicationId = process.env.SQUARE_APPLICATION_ID;
    const applicationSecret = process.env.SQUARE_APPLICATION_SECRET;
    const redirectUri = process.env.SQUARE_REDIRECT_URI;
    if (!applicationId || !applicationSecret || !redirectUri) throw new Error("Square OAuth is not configured");

    const tokenResponse = await fetch(`${squareBaseUrl()}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Square-Version": process.env.SQUARE_API_VERSION || "2026-08-19" },
      body: JSON.stringify({
        client_id: applicationId,
        client_secret: applicationSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token || !token.merchant_id) {
      throw new Error("Square rejected the authorization code");
    }

    const locationsResponse = await fetch(`${squareBaseUrl()}/v2/locations`, {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Square-Version": process.env.SQUARE_API_VERSION || "2026-08-19",
      },
      cache: "no-store",
    });
    const locationsPayload = await locationsResponse.json();
    const locations = Array.isArray(locationsPayload?.locations) ? locationsPayload.locations : [];
    const location = locations.find((item: any) => item?.status === "ACTIVE") || locations[0];
    if (!locationsResponse.ok || !location?.id) throw new Error("No active Square location was found");

    await saveIntegrationConnection({
      orgId: oauthState.orgId,
      provider: "square",
      externalAccountId: String(token.merchant_id),
      externalAccountName: String(location.name || "Square"),
      accessToken: String(token.access_token),
      refreshToken: token.refresh_token ? String(token.refresh_token) : null,
      tokenExpiresAt: token.expires_at ? new Date(token.expires_at) : null,
      connectedByIdentityId: oauthState.identityId,
      scopes: ["payments", "orders", "customers", "items", "merchant_profile"],
      metadata: {
        locationId: String(location.id),
        locationName: String(location.name || ""),
        environment: process.env.SQUARE_ENVIRONMENT || "production",
      },
    });

    return NextResponse.redirect(new URL(oauthState.redirectPath || "/onboarding?step=payments&square=connected", request.url));
  } catch (error) {
    console.error("Square OAuth callback failed:", error);
    return NextResponse.redirect(new URL("/onboarding?step=payments&square=oauth_failed", request.url));
  }
}
