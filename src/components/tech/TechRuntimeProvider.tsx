"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/auth";
import { useGpsStatus } from "@/components/tech/GpsStatusContext";
import { startGpsRuntime } from "@/lib/tech-gps-runtime";

export default function TechRuntimeProvider() {
  const { isLoaded, user } = useUser();
  const { update } = useGpsStatus();
  useEffect(() => {
    update({ isTracking: false, lastPingAt: null, accuracy: null, error: null, gpsPermission: "unknown" });
    if (!CLERK_ENABLED || !isLoaded || !user?.id) return;
    return startGpsRuntime({ navigator, document, window, fetch, update });
  }, [isLoaded, user?.id, update]);
  return null;
}
