"use client";

import { useUser } from "@clerk/nextjs";

type DisplayUser = {
  id: string;
  fullName?: string | null;
  firstName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
};

export type DisplayIdentity = {
  userId: string | null;
  name: string;
  firstName: string;
  initials: string;
  isLoaded: boolean;
  isSignedIn: boolean;
};

export const UNKNOWN_DISPLAY_IDENTITY: DisplayIdentity = {
  userId: null, name: "Account", firstName: "", initials: "", isLoaded: false, isSignedIn: false,
};

export function getDisplayIdentity(user: DisplayUser | null | undefined, isLoaded: boolean): DisplayIdentity {
  if (!isLoaded || !user) return { ...UNKNOWN_DISPLAY_IDENTITY, isLoaded };
  const name = user.fullName?.trim() || user.firstName?.trim() || user.username?.trim()
    || user.primaryEmailAddress?.emailAddress?.trim() || "Account";
  const words = name.split(/\s+/);
  const initials = name === "Account" ? "" : [words[0], ...(words.length > 1 ? [words[words.length - 1]] : [])]
    .map((word) => Array.from(word)[0]).join("").toLocaleUpperCase();
  return { userId: user.id, name, firstName: user.firstName?.trim() || "", initials, isLoaded, isSignedIn: true };
}

// Reuses ClerkProvider's current user. No extra requests or cross-user cache.
// Mount consumers under ClerkProvider, as configured by the root layout.
export function useAuthenticatedDisplayIdentity(): DisplayIdentity {
  const { user, isLoaded } = useUser();
  return getDisplayIdentity(user, isLoaded);
}
