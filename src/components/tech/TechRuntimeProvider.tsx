"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/auth";

const GPS_ENABLED_KEY = "hearth-tech-gps-enabled";
const GPS_TRACKING_KEY = "hearth-tech-is-tracking";

function readFlag(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;
  return stored === "true";
}

export default function TechRuntimeProvider() {
  const pathname = usePathname();
  const { isLoaded } = useUser();
  const watchRef = useRef<number | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [isTracking, setIsTracking] = useState(true);

  useEffect(() => {
    const syncFlags = () => {
      setGpsEnabled(readFlag(GPS_ENABLED_KEY, true));
      setIsTracking(readFlag(GPS_TRACKING_KEY, true));
    };

    syncFlags();
    window.addEventListener("storage", syncFlags);
    window.addEventListener("hearth-tech-gps-toggle", syncFlags as EventListener);
    return () => {
      window.removeEventListener("storage", syncFlags);
      window.removeEventListener("hearth-tech-gps-toggle", syncFlags as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!CLERK_ENABLED || !isLoaded) return;
    if (pathname === "/tech/profile") return;
    if (!gpsEnabled || !isTracking) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;

    async function startWatcher() {
      const res = await fetch("/api/tech/me", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data = await res.json().catch(() => null);
      const techId = data?.tech?.id as string | undefined;
      const techName = data?.tech?.name as string | undefined;
      const techEmail = data?.tech?.email as string | undefined;
      if (!techId) return;

      watchRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            await fetch("/api/tech/locations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                techId,
                techName,
                techEmail,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed,
                heading: pos.coords.heading,
                timestamp: new Date(pos.timestamp).toISOString(),
              }),
            });
          } catch {
            // no-op
          }
        },
        () => {},
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 20000,
        }
      );
    }

    startWatcher();

    return () => {
      cancelled = true;
      if (watchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [gpsEnabled, isLoaded, isTracking, pathname]);

  return null;
}
