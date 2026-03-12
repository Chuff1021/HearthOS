"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosDevice() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function TechPwaProvider() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandaloneDisplay());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/tech-sw.js", { scope: "/tech/" });
      } catch {
        // Keep installability progressive; no hard failure if SW registration fails.
      }
    };

    register();
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstallEvent(null);
      setIsInstalled(true);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const installMode = useMemo(() => {
    if (isInstalled || dismissed) return "hidden" as const;
    if (installEvent) return "android" as const;
    if (isIosDevice() && !isStandaloneDisplay()) return "ios" as const;
    return "hidden" as const;
  }, [dismissed, installEvent, isInstalled]);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
    }
    setInstallEvent(null);
    setDismissed(true);
  };

  if (installMode === "hidden") return null;

  return (
    <div
      className="sticky top-0 z-30 px-3 pt-3"
      style={{ pointerEvents: "none" }}
    >
      <div
        className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-lg"
        style={{
          pointerEvents: "auto",
          background: "rgba(255,250,245,0.96)",
          border: "1px solid rgba(255,106,0,0.18)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 10px 28px rgba(15,23,42,0.08)",
        }}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "#111827" }}>
            Install HearthOS Tech
          </div>
          <div className="text-xs" style={{ color: "#6B7280" }}>
            {installMode === "android"
              ? "Add the tech app to your home screen for a full-screen mobile workspace."
              : "Use Share, then Add to Home Screen to install on iPhone."}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {installMode === "android" ? (
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #ff6a00, #f59e0b)" }}
            >
              Install
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-xl px-3 py-2 text-xs font-semibold"
              style={{ color: "#C2410C", background: "rgba(255,106,0,0.1)" }}
            >
              Got it
            </button>
          )}
          {installMode === "android" && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-xl px-2 py-2 text-xs font-medium"
              style={{ color: "#9A3412" }}
            >
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
