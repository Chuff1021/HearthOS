"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import TechBottomNav from "@/components/tech/TechBottomNav";
import { useGpsStatus } from "@/components/tech/GpsStatusContext";

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const gps = useGpsStatus();

  const [requestType, setRequestType] = useState<"paid_vacation" | "unpaid_vacation" | "unpaid_appointment_time">("paid_vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestStatus, setRequestStatus] = useState<string>("");
  const [todayStats, setTodayStats] = useState({
    jobsCompleted: 0,
    hoursWorked: "0h 00m",
    milesDriven: 0,
    clockIn: "--",
  });
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [techId, setTechId] = useState<string>("");
  const [techName, setTechName] = useState<string>("");
  const [techEmail, setTechEmail] = useState<string>("");

  const handleSignOut = async () => {
    await signOut({ redirectUrl: "/sign-in" });
  };

  const authName = user?.fullName || user?.firstName || user?.username || "";
  const userName = techName || authName || "Service Tech";
  const userEmail = techEmail || user?.primaryEmailAddress?.emailAddress || "";
  const userInitials = userName.split(" ").map(n => n[0]).join("").toUpperCase();

  // Load profile stats + tech identity from /api/tech/me (server handles auto-link)
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    async function loadProfileStats() {
      try {
        const res = await fetch("/api/tech/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data || cancelled) return;

        // Tech identity from server
        if (data.tech?.id) setTechId(data.tech.id);
        if (data.tech?.name) setTechName(data.tech.name);
        if (data.tech?.email) setTechEmail(data.tech.email);

        const openClock = data.clockEntry?.clockInAt ? new Date(data.clockEntry.clockInAt) : null;
        const totalMinutes = openClock ? Math.max(0, Math.round((Date.now() - openClock.getTime()) / 60000)) : 0;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        setTodayStats({
          jobsCompleted: data.stats?.jobsCompletedToday ?? 0,
          hoursWorked: `${hours}h ${String(minutes).padStart(2, "0")}m`,
          milesDriven: Number(data.stats?.milesToday ?? 0),
          clockIn: openClock
            ? openClock.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : "--",
        });
        setIsClockedIn(Boolean(data.clockEntry));
      } catch {
        // no-op
      }
    }

    const refresh = () => {
      void loadProfileStats();
    };

    refresh();
    window.addEventListener("hearth-tech-clock-changed", refresh as EventListener);
    const intervalId = window.setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      window.removeEventListener("hearth-tech-clock-changed", refresh as EventListener);
      window.clearInterval(intervalId);
    };
  }, [isLoaded]);

  async function requestLocationPermission() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      gps.update({ error: "Geolocation not supported." });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        gps.update({ gpsPermission: "granted", error: null });
      },
      (err) => {
        gps.update({ gpsPermission: "denied", error: err.message || "Location permission denied." });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  async function submitTimeOffRequest() {
    const effectiveTechId = techId || user?.id;
    if (!effectiveTechId || !startDate || !endDate) {
      setRequestStatus("Please select dates first.");
      return;
    }

    const res = await fetch("/api/time-off-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        techId: effectiveTechId,
        techName: userName,
        type: requestType,
        startDate,
        endDate,
        reason: requestReason || undefined,
      }),
    });

    if (res.ok) {
      setRequestStatus("Request submitted.");
      setRequestReason("");
    } else {
      const data = await res.json().catch(() => ({}));
      setRequestStatus(data.error || "Failed to submit request.");
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-32">
      {/* Header */}
      <header
        className="bg-[var(--color-surface-1)] sticky top-0 z-10 px-4 pb-4"
        style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
      >
        <h1 className="text-lg font-semibold">Profile</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* User Info */}
        <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center text-2xl font-bold">
              {userInitials}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{userName}</h2>
              <p className="text-sm text-gray-400">Service Technician</p>
              <p className="text-xs text-gray-500">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Today's Stats */}
        <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
          <h3 className="font-semibold mb-3">Today&apos;s Activity</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--color-surface-3)] rounded-lg p-3">
              <p className="text-2xl font-bold text-blue-600">{todayStats.jobsCompleted}</p>
              <p className="text-xs text-gray-400">Jobs Done</p>
            </div>
            <div className="bg-[var(--color-surface-3)] rounded-lg p-3">
              <p className="text-2xl font-bold text-blue-600">{todayStats.hoursWorked}</p>
              <p className="text-xs text-gray-400">Hours Worked</p>
            </div>
            <div className="bg-[var(--color-surface-3)] rounded-lg p-3">
              <p className="text-2xl font-bold text-blue-600">{todayStats.milesDriven}</p>
              <p className="text-xs text-gray-400">Miles Driven</p>
            </div>
            <div className="bg-[var(--color-surface-3)] rounded-lg p-3">
              <p className="text-2xl font-bold text-blue-600">{todayStats.clockIn}</p>
              <p className="text-xs text-gray-400">Clocked In</p>
            </div>
          </div>
        </div>

        {/* GPS Status — reads from shared context, no local tracking */}
        <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">GPS Tracking</h3>
            <div className={`flex items-center gap-1 text-xs ${gps.isTracking ? "text-green-400" : "text-gray-500"}`}>
              <div className={`w-2 h-2 rounded-full ${gps.isTracking ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
              {gps.isTracking ? "Active" : isClockedIn ? "Starting..." : "Clock in to track"}
            </div>
          </div>

          {gps.isTracking && gps.lastPingAt && (
            <div className="bg-[var(--color-surface-3)] rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium">GPS Active</p>
                  <p className="text-xs text-gray-400">
                    Last ping: {new Date(gps.lastPingAt).toLocaleTimeString()}
                    {gps.accuracy != null ? ` · ±${Math.round(gps.accuracy)}m` : ""}
                  </p>
                </div>
              </div>
            </div>
          )}

          {gps.error && (
            <div className="bg-red-500/15 border border-red-500/30 rounded-lg p-2 mb-3 text-xs text-red-300">
              {gps.error}
            </div>
          )}

          <div className="space-y-3">
            {gps.gpsPermission !== "granted" && (
              <button
                onClick={requestLocationPermission}
                className="w-full py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
              >
                Request Location Permission
              </button>
            )}
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              GPS Permission: {gps.gpsPermission}
            </div>
            <div className="text-xs" style={{ color: isClockedIn ? "#15803D" : "var(--color-text-muted)" }}>
              Shift: {isClockedIn ? "Clocked in — GPS auto-tracking" : "Clocked out — GPS paused"}
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
          <h3 className="font-semibold mb-3">Contact Information</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Email</span>
              <span className="text-sm">{userEmail}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Phone</span>
              <span className="text-sm">{user?.phoneNumbers?.[0]?.phoneNumber || "(555) 123-4567"}</span>
            </div>
          </div>
        </div>

        {/* Time Off Request */}
        <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
          <h3 className="font-semibold mb-3">Request Time Off</h3>
          <div className="space-y-2">
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as typeof requestType)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-3)] border border-gray-700"
            >
              <option value="paid_vacation">Paid Vacation</option>
              <option value="unpaid_vacation">Unpaid Vacation</option>
              <option value="unpaid_appointment_time">Unpaid Appointment Time</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 rounded-lg bg-[var(--color-surface-3)] border border-gray-700" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 rounded-lg bg-[var(--color-surface-3)] border border-gray-700" />
            </div>
            <textarea
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-3)] border border-gray-700"
            />
            <button onClick={submitTimeOffRequest} className="w-full py-2 rounded-lg font-medium" style={{ background: "#2563EB", color: "white" }}>
              Submit Request
            </button>
            {requestStatus && <p className="text-xs text-gray-300">{requestStatus}</p>}
          </div>
        </div>

        {/* Quick Links */}
        <div className="space-y-2">
          <button onClick={() => router.push("/tech/time-history")} className="w-full bg-[var(--color-surface-1)] rounded-xl p-4 text-left flex items-center justify-between">
            <span>Time History</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={() => router.push("/tech")} className="w-full bg-[var(--color-surface-1)] rounded-xl p-4 text-left flex items-center justify-between">
            <span>Job History</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={() => router.push("/settings")} className="w-full bg-[var(--color-surface-1)] rounded-xl p-4 text-left flex items-center justify-between">
            <span>Settings</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Logout */}
        <button
          onClick={handleSignOut}
          className="w-full bg-red-500/20 text-red-400 rounded-xl p-4 font-medium border border-red-500/50 cursor-pointer"
        >
          Sign Out
        </button>
      </div>

      <TechBottomNav active="profile" />
    </div>
  );
}
