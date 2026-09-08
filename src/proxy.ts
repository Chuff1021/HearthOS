import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default hasClerk
  ? clerkMiddleware(async (auth, request) => {
      const path = request.nextUrl.pathname;
      // APIs enforce their own business/partner/provider authorization.
      const publicPage = ["/pay", "/accept-estimate", "/meeks"].includes(path)
        || ["/sign-in", "/sign-up"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
      if (!path.startsWith("/api/") && !publicPage) await auth.protect();
    })
  : function proxy(_request: NextRequest) {
      return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
