import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const protectedRoutesEnabled = process.env.MULTITENANT_ROUTE_PROTECTION_ENABLED === "true";

const publicExactPaths = ["/"];

const publicPrefixes = [
  "/sign-in",
  "/sign-up",
  "/demo",
  "/accept-estimate",
  "/pay",
  "/api/demo-requests",
  "/api/demo/pilot",
  "/api/internal/provision-pilot",
  "/api/estimates/accept",
  "/api/quickbooks/callback",
  "/api/square/callback",
  "/api/square/webhook",
  "/api/gabe/support/chatwoot/webhook",
  "/api/cron/",
];

function isPublicPath(pathname: string) {
  return publicExactPaths.includes(pathname)
    || publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export default hasClerk
  ? clerkMiddleware(async (auth, request) => {
      if (protectedRoutesEnabled && !isPublicPath(request.nextUrl.pathname)) {
        await auth.protect();
      }
    })
  : function proxy(_request: NextRequest) {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
