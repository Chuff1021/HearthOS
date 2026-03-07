import type { Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/auth";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HearthOS  Fireplace Field Service Management",
  description:
    "Purpose-built field service management for fireplace installation, service, and retail companies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkEnabled = isClerkConfigured();

  const appShell = (
    <html lang="en">
      <body className="font-sans">
        <header className="flex items-center justify-end gap-3 px-6 py-3 border-b border-neutral-900 bg-black text-white">
          {clerkEnabled ? (
            <>
              <SignedOut>
                <SignInButton />
                <SignUpButton />
              </SignedOut>
              <SignedIn>
                <UserButton />
              </SignedIn>
            </>
          ) : null}
        </header>
        {children}
      </body>
    </html>
  );

  if (!clerkEnabled) {
    return appShell;
  }

  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#f97316",
          colorBackground: "#0f1629",
          colorInputBackground: "#1a2540",
          colorInputText: "#f0f4ff",
          colorText: "#f0f4ff",
          colorTextSecondary: "#8b9cc8",
          borderRadius: "0.75rem",
        },
        elements: {
          card: {
            backgroundColor: "#0f1629",
            border: "1px solid rgba(255,255,255,0.07)",
          },
          formButtonPrimary: {
            background: "linear-gradient(135deg, #f97316, #ea6c0a)",
            boxShadow: "0 0 16px rgba(249,115,22,0.25)",
          },
        },
      }}
    >
      {appShell}
    </ClerkProvider>
  );
}
