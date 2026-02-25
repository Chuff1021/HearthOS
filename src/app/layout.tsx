import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HearthOS — Fireplace Field Service Management",
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
      <html lang="en">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
