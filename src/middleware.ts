import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple middleware - Clerk is optional
// If Clerk env vars are set, it will be handled by Clerk's injected middleware
export function middleware(request: NextRequest) {
  // Continue to the next middleware/handler
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/(api|trpc)(.*)"],
};
