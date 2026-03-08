import { clerkMiddleware } from "@clerk/nextjs/server";

// Hotfix: keep Clerk middleware active so existing Clerk hooks/components
// in app shell routes do not throw runtime auth() / client exceptions.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
