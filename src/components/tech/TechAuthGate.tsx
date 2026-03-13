"use client";

import { RedirectToSignIn, SignedIn, SignedOut } from "@clerk/nextjs";

export default function TechAuthGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
