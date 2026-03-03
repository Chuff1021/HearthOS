import type { Metadata } from "next";
import { Inter } from "next/font/google";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

// Force dynamic rendering to avoid Clerk prerender issues
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
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#0a84ff",
          colorBackground: "#ffffff",
          colorInputBackground: "#f3f6fc",
          colorInputText: "#0f172a",
          colorText: "#0f172a",
          colorTextSecondary: "#64748b",
          borderRadius: "0.75rem",
        },
        elements: {
          card: {
            backgroundColor: "#ffffff",
            border: "1px solid rgba(15,23,42,0.12)",
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.08)",
          },
          formButtonPrimary: {
            background: "linear-gradient(135deg, #0a84ff, #006ee6)",
            boxShadow: "0 2px 10px rgba(10,132,255,0.2)",
          },
        },
      }}
    >
      <html lang="en">
        <body className={inter.className}>
          <header className="flex items-center justify-end gap-3 px-6 py-3 border-b" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-1)", color: "var(--color-text-primary)" }}>
            <SignedOut>
              <SignInButton />
              <SignUpButton />
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
