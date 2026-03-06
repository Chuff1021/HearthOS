function isEnabledFlag(value: string | undefined): boolean {
  if (value == null) {
    return true;
  }

  return value === "true";
}

function getServerAuthFlag(): string | undefined {
  return process.env.AUTH_ENABLED ?? process.env.NEXT_PUBLIC_AUTH_ENABLED;
}

/**
 * Check if Clerk authentication is configured.
 * Returns true only when both Clerk env vars are set.
 */
export function isClerkConfigured(): boolean {
  return !!(
    isEnabledFlag(getServerAuthFlag()) &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY
  );
}

/**
 * Client-side check — only checks the public key (available in browser).
 */
export function isClerkConfiguredClient(): boolean {
  return !!(
    isEnabledFlag(process.env.NEXT_PUBLIC_AUTH_ENABLED ?? process.env.AUTH_ENABLED) &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  );
}

// Re-export the CLERK_ENABLED constant for use in conditional rendering
export const CLERK_ENABLED = isClerkConfiguredClient();
