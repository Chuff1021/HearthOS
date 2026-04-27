import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

// Display serif — used for hero KPIs and section headlines.
// Fraunces has a warm, slightly old-style feel that pairs well with Forge & Flame.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-display",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HearthOS  Fireplace Field Service Management",
  description:
    "Purpose-built field service management for fireplace installation, service, and retail companies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
