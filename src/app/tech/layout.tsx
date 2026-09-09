import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "@/app/production-workspaces.css";
import { isClerkConfigured } from "@/lib/auth";
import TechAuthGate from "@/components/tech/TechAuthGate";
import TechPwaProvider from "@/components/tech/TechPwaProvider";
import TechRuntimeProvider from "@/components/tech/TechRuntimeProvider";
import { GpsStatusProvider } from "@/components/tech/GpsStatusContext";

export const metadata: Metadata = {
  title: "HearthOS Tech",
  description: "Installable mobile tech workspace for HearthOS field teams.",
  manifest: "/tech/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HearthOS",
  },
  icons: {
    apple: "/tech/apple-touch-icon.png",
    icon: [
      { url: "/tech/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/tech/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2563eb",
};

export default function TechLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkEnabled = isClerkConfigured();

  return (
    <div className={`${GeistSans.className} production-tech min-h-screen`} style={{ background: "var(--color-bg)", color: "var(--color-text-primary)" }}>
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        <TechPwaProvider />
        {clerkEnabled ? (
          <TechAuthGate>
            <GpsStatusProvider>
              <TechRuntimeProvider />
              {children}
            </GpsStatusProvider>
          </TechAuthGate>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
