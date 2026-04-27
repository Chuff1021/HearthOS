import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Montserrat } from "next/font/google";
import "./globals.css";

// Forge & Flame uses Montserrat for everything (their --font-body-family +
// --font-heading-family). Match exactly so the dashboard feels cut from
// the same cloth as forgenflame.com.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
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
      <html lang="en" className={montserrat.variable}>
        <body className={montserrat.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
