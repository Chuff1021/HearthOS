import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, organizations } from "@/db";
import { getOrCreateDefaultOrg } from "@/lib/org";

async function clearQuickBooksConnection() {
  const org = await getOrCreateDefaultOrg();

  await db
    .update(organizations)
    .set({
      qbRealmId: null,
      qbAccessToken: null,
      qbRefreshToken: null,
      qbTokenExpiresAt: null,
      qbConnected: false,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));
}

function applyCookieClears(response: NextResponse) {
  response.cookies.set("qb_access_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  response.cookies.set("qb_refresh_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  response.cookies.set("qb_realm_id", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  response.cookies.set("qb_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export async function POST() {
  try {
    await clearQuickBooksConnection();
    const response = NextResponse.json({ success: true, disconnected: true });
    applyCookieClears(response);
    return response;
  } catch (err) {
    console.error("Failed to disconnect QuickBooks:", err);
    return NextResponse.json({ error: "Failed to disconnect QuickBooks" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await clearQuickBooksConnection();
    const response = NextResponse.redirect(new URL("/integrations/quickbooks?disconnected=true", request.url));
    applyCookieClears(response);
    return response;
  } catch (err) {
    console.error("Failed to disconnect QuickBooks:", err);
    return NextResponse.redirect(new URL("/integrations/quickbooks?error=disconnect_failed", request.url));
  }
}
