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
const KEEPALIVE_INTERVAL = 90_000; // restart dead watcher every 90s

export default function TechRuntimeProvider() {
  const { isLoaded } = useUser();
  const gps = useGpsStatus();
  const watchRef = useRef<number | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // Refs for tracking state inside callbacks
  const lastSentRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cache identity so visibility-change restarts don't need to re-fetch
  const identityRef = useRef<{ techId: string; techName?: string; techEmail?: string } | null>(null);

  // Poll clock state
  useEffect(() => {
    if (!CLERK_ENABLED || !isLoaded) return;

    let cancelled = false;

    async function loadClockState() {
      try {
        const res = await fetch("/api/tech/me", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => null);
        if (!cancelled) {
          setClockedIn(Boolean(data?.clockEntry));
          setIsOwner(Boolean(data?.isOwner));
        }
      } catch {
        // Don't change clock state on network errors — keep the last known state
      }
    }

    const refresh = () => { void loadClockState(); };

    refresh();
    window.addEventListener("hearth-tech-clock-changed", refresh as EventListener);
    const intervalId = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener("hearth-tech-clock-changed", refresh as EventListener);
      window.clearInterval(intervalId);
    };
  }, [isLoaded]);

  // GPS tracking — owners always track, techs only when clocked in
  useEffect(() => {
    if (!CLERK_ENABLED || !isLoaded) return;
    if (!clockedIn && !isOwner) {
      gps.update({ isTracking: false });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      gps.update({ error: "Geolocation not supported", isTracking: false });
      return;
    }

    let cancelled = false;

    function initWatch(techId: string, techName?: string, techEmail?: string) {
      if (cancelled) return;

      // Clear any existing watcher before creating a new one
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }

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
              error: "location_denied",
              isTracking: false,
              gpsPermission: "denied",
            });
            // Don't retry on denial — permission change listener handles recovery
            return;
          }

          // POSITION_UNAVAILABLE or TIMEOUT — retry with backoff
          gps.update({ error: `GPS error: ${err.message}`, isTracking: false });

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
            if (!cancelled) initWatch(techId, techName, techEmail);
          }, delay);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0, // always request a fresh position
          timeout: 20_000,
        }
      );

      gps.update({ isTracking: true, error: null });
    }

    async function startWatcher() {
      if (cancelled) return;

      // Use cached identity if available, otherwise fetch
      if (!identityRef.current) {
        try {
          const res = await fetch("/api/tech/me", { cache: "no-store" });
          if (!res.ok || cancelled) return;
          const data = await res.json().catch(() => null);
          const techId = data?.tech?.id;
          if (!techId || cancelled) return;
          identityRef.current = {
            techId,
            techName: data?.tech?.name,
            techEmail: data?.tech?.email,
          };
        } catch {
          if (!cancelled) gps.update({ error: "Failed to load tech identity" });
          return;
        }
      }

      const { techId, techName, techEmail } = identityRef.current!;
      initWatch(techId, techName, techEmail);
    }

    // Restart watcher when app comes back into view (handles mobile backgrounding)
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !cancelled && watchRef.current === null) {
        retryCountRef.current = 0;
        void startWatcher();
      }
    }

    // Also handle window focus (desktop tab switching)
    function handleFocus() {
      if (!cancelled && watchRef.current === null) {
        retryCountRef.current = 0;
        void startWatcher();
      }
    }

    // Keepalive: if the watcher died silently, restart it every 90 seconds
    const keepaliveId = setInterval(() => {
      if (!cancelled && watchRef.current === null && document.visibilityState === "visible") {
        retryCountRef.current = 0;
        void startWatcher();
      }
    }, KEEPALIVE_INTERVAL);

    // Listen for permission changes (e.g., user enables location in browser settings)
    let permissionStatus: PermissionStatus | null = null;
    function handlePermissionChange() {
      if (!cancelled && permissionStatus?.state === "granted" && watchRef.current === null) {
        retryCountRef.current = 0;
        gps.update({ error: null, gpsPermission: "granted" });
        void startWatcher();
      }
    }
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (!cancelled) {
          permissionStatus = status;
          status.addEventListener("change", handlePermissionChange);
        }
      })
      .catch(() => {});

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    // Initial start
    void startWatcher();

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
      clearInterval(keepaliveId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      permissionStatus?.removeEventListener("change", handlePermissionChange);
      lastSentRef.current = null;
      retryCountRef.current = 0;
      identityRef.current = null;
    };
  }, [clockedIn, isLoaded, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
