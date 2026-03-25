"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/auth";
import { useGpsStatus } from "@/components/tech/GpsStatusContext";

// Haversine distance in meters between two lat/lng points
function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ACCURACY_THRESHOLD = 200; // meters — skip pings worse than this
const MIN_DISTANCE = 10; // meters — skip if tech hasn't moved this far
const HEARTBEAT_INTERVAL = 60_000; // 60s — send a ping even when stationary
const RETRY_DELAY_BASE = 5_000; // 5s initial retry
const RETRY_DELAY_MAX = 30_000; // 30s max backoff
const MAX_RETRIES_BEFORE_BACKOFF = 5;

export default function TechRuntimeProvider() {
  const { isLoaded } = useUser();
  const gps = useGpsStatus();
  const watchRef = useRef<number | null>(null);
  const [clockedIn, setClockedIn] = useState(false);

  // Refs for tracking state inside callbacks
  const lastSentRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll clock state
  useEffect(() => {
    if (!CLERK_ENABLED || !isLoaded) return;

    let cancelled = false;

    async function loadClockState() {
      try {
        const res = await fetch("/api/tech/me", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => null);
        if (!cancelled) setClockedIn(Boolean(data?.clockEntry));
      } catch {
        if (!cancelled) setClockedIn(false);
      }
    }

    const refresh = () => {
      void loadClockState();
    };

    refresh();
    window.addEventListener("hearth-tech-clock-changed", refresh as EventListener);
    const intervalId = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener("hearth-tech-clock-changed", refresh as EventListener);
      window.clearInterval(intervalId);
    };
  }, [isLoaded]);

  // GPS tracking — single gate: clockedIn
  useEffect(() => {
    if (!CLERK_ENABLED || !isLoaded) return;
    if (!clockedIn) {
      gps.update({ isTracking: false });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      gps.update({ error: "Geolocation not supported", isTracking: false });
      return;
    }

    let cancelled = false;

    async function startWatcher() {
      // Get tech identity
      let techId: string | undefined;
      let techName: string | undefined;
      let techEmail: string | undefined;

      try {
        const res = await fetch("/api/tech/me", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => null);
        techId = data?.tech?.id;
        techName = data?.tech?.name;
        techEmail = data?.tech?.email;
      } catch {
        if (!cancelled) gps.update({ error: "Failed to load tech identity" });
        return;
      }

      if (!techId || cancelled) return;

      function initWatch() {
        if (cancelled) return;

        watchRef.current = navigator.geolocation.watchPosition(
          async (pos) => {
            const { latitude, longitude, accuracy, speed, heading } = pos.coords;

            // Update context with latest accuracy
            gps.update({ accuracy, gpsPermission: "granted" });

            // Accuracy gate — skip bad readings
            if (accuracy > ACCURACY_THRESHOLD) return;

            // Min-distance + heartbeat gate
            const now = Date.now();
            const last = lastSentRef.current;
            if (last) {
              const dist = distanceMeters(last.lat, last.lng, latitude, longitude);
              const elapsed = now - last.time;
              if (dist < MIN_DISTANCE && elapsed < HEARTBEAT_INTERVAL) return;
            }

            // Send the ping
            try {
              await fetch("/api/tech/locations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  techId,
                  techName,
                  techEmail,
                  lat: latitude,
                  lng: longitude,
                  accuracy,
                  speed,
                  heading,
                  timestamp: new Date(pos.timestamp).toISOString(),
                }),
              });

              lastSentRef.current = { lat: latitude, lng: longitude, time: now };
              retryCountRef.current = 0;
              gps.update({
                isTracking: true,
                lastPingAt: new Date().toISOString(),
                error: null,
              });
            } catch {
              // POST failed — still tracking, just couldn't send
            }
          },
          (err) => {
            if (cancelled) return;

            if (err.code === err.PERMISSION_DENIED) {
              gps.update({
                error: "Location permission denied",
                isTracking: false,
                gpsPermission: "denied",
              });
              return;
            }

            // POSITION_UNAVAILABLE or TIMEOUT — retry with backoff
            gps.update({ error: `GPS error: ${err.message}` });

            if (watchRef.current !== null) {
              navigator.geolocation.clearWatch(watchRef.current);
              watchRef.current = null;
            }

            retryCountRef.current += 1;
            const delay =
              retryCountRef.current > MAX_RETRIES_BEFORE_BACKOFF
                ? RETRY_DELAY_MAX
                : RETRY_DELAY_BASE;

            retryTimerRef.current = setTimeout(() => {
              initWatch();
            }, delay);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 10_000,
            timeout: 20_000,
          }
        );

        gps.update({ isTracking: true, error: null });
      }

      initWatch();
    }

    startWatcher();

    return () => {
      cancelled = true;
      if (watchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      lastSentRef.current = null;
      retryCountRef.current = 0;
    };
  }, [clockedIn, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
