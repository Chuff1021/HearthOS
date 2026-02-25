/**
 * Check if Clerk authentication is configured.
 * Returns true only when both Clerk env vars are set.
 */
export function isClerkConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY
  );
}

/**
 * Client-side check — only checks the public key (available in browser).
 */
export function isClerkConfiguredClient(): boolean {
  return !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

// Re-export the CLERK_ENABLED constant for use in conditional rendering
export const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
