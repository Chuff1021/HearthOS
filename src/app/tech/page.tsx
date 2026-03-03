"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

// Mock data for demo
const mockJobs = [
  {
    id: "1",
    customer: "Johnson Residence",
    address: "123 Oak Street, Springfield",
    type: "Annual Inspection",
    scheduled: "9:00 AM",
    status: "pending",
    phone: "(555) 123-4567",
    fireplace: "Regency F1100",
  },
  {
    id: "2",
    customer: "Smith Home",
    address: "456 Maple Ave, Springfield",
    type: "Installation",
    scheduled: "11:30 AM",
    status: "pending",
    phone: "(555) 234-5678",
    fireplace: "Napoleon AS35",
  },
  {
    id: "3",
    customer: "Williams Property",
    address: "789 Pine Rd, Springfield",
    type: "Service Call",
    scheduled: "2:00 PM",
    status: "pending",
    phone: "(555) 345-6789",
    fireplace: "Heat & Glo SLR",
  },
];

export default function TechApp() {
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [shiftStartTime, setShiftStartTime] = useState<Date | null>(null);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [jobStartTime, setJobStartTime] = useState<Date | null>(null);
  const [clockLoading, setClockLoading] = useState(true);
  const [clockSubmitting, setClockSubmitting] = useState(false);
  const [clockError, setClockError] = useState<string | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [lastGpsAt, setLastGpsAt] = useState<Date | null>(null);
  const [isRecognizedTeamMember, setIsRecognizedTeamMember] = useState<boolean | null>(null);

  const { user, isLoaded } = useUser();
  const displayName = user?.firstName || user?.fullName || "Tech";

  useEffect(() => {
    const loadClockStatus = async () => {
      try {
        setClockLoading(true);
        const res = await fetch("/api/tech/timeclock", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to load clock status");
        }

        const data = await res.json();
        setIsClockedIn(Boolean(data.isClockedIn));
        setShiftStartTime(data.shiftStartTime ? new Date(data.shiftStartTime) : null);
        setClockError(null);
      } catch (error) {
        console.error("Failed to load clock state", error);
        setClockError("Could not load shift status.");
      } finally {
        setClockLoading(false);
      }
    };

    void loadClockStatus();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const checkTeamMembership = async () => {
      try {
        const res = await fetch("/api/techs?activeOnly=true", { cache: "no-store" });
        if (!res.ok) throw new Error("Could not load team roster");
        const data = await res.json();
        const techs: Array<{ email?: string; name?: string }> = data.techs || [];

        const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
        const name = (user?.fullName || "").toLowerCase();

        const found = techs.some((t) => {
          const tEmail = (t.email || "").toLowerCase();
          const tName = (t.name || "").toLowerCase();
          return (email && tEmail === email) || (name && tName === name);
        });

        setIsRecognizedTeamMember(found);
      } catch {
        setIsRecognizedTeamMember(null);
      }
    };

    void checkTeamMembership();
  }, [isLoaded, user]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("Geolocation is not supported on this device/browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGpsEnabled(true);
        setGpsError(null);
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLastGpsAt(new Date());
      },
      (error) => {
        setGpsEnabled(false);
        setGpsError(error.message || "Location permission denied or unavailable.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const mapEmbedUrl = useMemo(() => {
    if (!coords) return null;
    const { lat, lng } = coords;
    const d = 0.01;
    const left = lng - d;
    const right = lng + d;
    const top = lat + d;
    const bottom = lat - d;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`;
  }, [coords]);

  const handleClockIn = async () => {
    try {
      setClockSubmitting(true);
      setClockError(null);

      const action = isClockedIn ? "clock_out" : "clock_in";
      const res = await fetch("/api/tech/timeclock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Could not update shift status");
      }

      setIsClockedIn(Boolean(data.isClockedIn));
      setShiftStartTime(data.shiftStartTime ? new Date(data.shiftStartTime) : null);

      if (!data.isClockedIn) {
        setActiveJob(null);
        setJobStartTime(null);
      }
    } catch (error) {
      console.error("Failed to toggle clock status", error);
      setClockError(error instanceof Error ? error.message : "Could not update shift status.");
    } finally {
      setClockSubmitting(false);
    }
  };

  const handleJobClock = (jobId: string) => {
    if (activeJob === jobId) {
      setActiveJob(null);
      setJobStartTime(null);
    } else {
      setActiveJob(jobId);
      setJobStartTime(new Date());
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="ui-page-mobile flex flex-col min-h-screen pb-20">
      {/* Header */}
      <header className="ui-mobile-header p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">HearthOS</h1>
            <p className="text-xs text-[var(--color-text-muted)]">Tech Dashboard · {displayName}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* GABE AI Button */}
            <Link
              href="/tech/gabe"
              className="ui-btn-primary p-2 rounded-full"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </Link>
            {/* GPS Status */}
            <div className={`flex items-center gap-1 text-xs ${gpsEnabled ? "text-green-600" : "text-amber-600"}`}>
              <div className={`w-2 h-2 rounded-full ${gpsEnabled ? "bg-green-500 animate-pulse" : "bg-amber-500"}`}></div>
              {gpsEnabled ? "GPS Live" : "GPS Off"}
            </div>
          </div>
        </div>
      </header>

      {/* Team Recognition + GPS Map */}
      <div className="mx-4 mt-4 space-y-3">
        <div className="ui-card p-3 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Team Membership</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {isRecognizedTeamMember === true
                  ? "You are recognized as an active team member."
                  : isRecognizedTeamMember === false
                  ? "Logged in, but not matched to team roster yet."
                  : "Checking team roster..."}
              </p>
            </div>
            <span
              className="text-xs px-2 py-1 rounded-full font-semibold"
              style={{
                background:
                  isRecognizedTeamMember === true
                    ? "rgba(16,185,129,0.12)"
                    : isRecognizedTeamMember === false
                    ? "rgba(245,158,11,0.12)"
                    : "rgba(148,163,184,0.12)",
                color:
                  isRecognizedTeamMember === true
                    ? "#059669"
                    : isRecognizedTeamMember === false
                    ? "#b45309"
                    : "#64748b",
              }}
            >
              {isRecognizedTeamMember === true ? "Recognized" : isRecognizedTeamMember === false ? "Not Matched" : "Checking"}
            </span>
          </div>
        </div>

        <div className="ui-card rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
            <p className="text-sm font-semibold">Live GPS Map</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {lastGpsAt ? `Updated ${formatTime(lastGpsAt)}` : "Waiting for location"}
            </p>
          </div>
          {mapEmbedUrl ? (
            <div className="h-52">
              <iframe
                title="Live technician location"
                src={mapEmbedUrl}
                className="w-full h-full border-0"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-sm text-[var(--color-text-muted)] px-4 text-center">
              {gpsError || "Enable location access on your phone to show live map."}
            </div>
          )}
          {coords && (
            <div className="px-3 py-2 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex flex-wrap gap-3">
              <span>Lat: {coords.lat.toFixed(6)}</span>
              <span>Lng: {coords.lng.toFixed(6)}</span>
              {coords.accuracy ? <span>±{Math.round(coords.accuracy)}m</span> : null}
            </div>
          )}
        </div>
      </div>

      {/* Clock In/Out Section */}
      <div className="p-4 bg-[var(--color-surface-1)] mx-4 mt-4 rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--color-text-muted)]">Shift Status</p>
            {clockLoading ? (
              <p className="text-xs text-[var(--color-text-muted)]">Loading shift status...</p>
            ) : isClockedIn && shiftStartTime ? (
              <p className="text-xs text-[var(--color-text-muted)]">Started: {formatTime(shiftStartTime)}</p>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">Not clocked in</p>
            )}
            {clockError && <p className="text-xs text-red-400 mt-1">{clockError}</p>}
          </div>
          <button
            onClick={handleClockIn}
            disabled={clockLoading || clockSubmitting}
            className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
              isClockedIn
                ? "bg-red-500/20 text-red-400 border border-red-500/50"
                : "bg-gradient-to-r from-green-500 to-emerald-500 text-white"
            }`}
          >
            {clockSubmitting ? "Saving..." : isClockedIn ? "Clock Out" : "Clock In"}
          </button>
        </div>
      </div>

      {/* Active Job Banner */}
      {activeJob && jobStartTime && (
        <div className="mx-4 mt-3 p-3 bg-[rgba(10,132,255,0.12)] border border-[rgba(10,132,255,0.35)] rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--color-ember)]">Active Job</p>
              <p className="font-semibold">
                {mockJobs.find((j) => j.id === activeJob)?.customer}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Started: {formatTime(jobStartTime)}
              </p>
            </div>
            <Link
              href={`/tech/job/${activeJob}`}
              className="bg-[var(--color-ember)] px-4 py-2 rounded-lg text-sm font-medium"
            >
              View Job
            </Link>
          </div>
        </div>
      )}

      {/* Today's Jobs */}
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-3">Today&apos;s Jobs</h2>
        <div className="space-y-3">
          {mockJobs.map((job) => (
            <div
              key={job.id}
              className={`ui-card p-4 border ${
                activeJob === job.id
                  ? "border-[var(--color-ember)]"
                  : "border-[var(--color-border)]"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold">{job.customer}</h3>
                  <p className="text-sm text-[var(--color-text-muted)]">{job.type}</p>
                </div>
                <span className="text-sm text-[var(--color-ember)] font-medium">
                  {job.scheduled}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mb-3">{job.address}</p>
              <div className="flex items-center gap-2">
                <Link
                  href={`/tech/job/${job.id}`}
                  className="flex-1 bg-[var(--color-surface-3)] text-center py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-surface-4)] transition-colors"
                >
                  View Details
                </Link>
                <button
                  onClick={() => handleJobClock(job.id)}
                  disabled={!isClockedIn}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeJob === job.id
                      ? "bg-red-500/20 text-red-400 border border-red-500/50"
                      : isClockedIn
                      ? "bg-gradient-to-r from-[var(--color-ember)] to-[var(--color-ember-dark)] text-white"
                      : "bg-[var(--color-surface-4)] text-[var(--color-text-muted)] cursor-not-allowed"
                  }`}
                >
                  {activeJob === job.id ? "End Job" : "Start Job"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[var(--color-surface-1)] border-t border-[var(--color-border)] z-20">
        <div className="max-w-md mx-auto flex justify-around py-3">
          <Link href="/tech" className="flex flex-col items-center text-[var(--color-ember)]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1">Jobs</span>
          </Link>
          <Link href="/tech/manuals" className="flex flex-col items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-xs mt-1">Manuals</span>
          </Link>
          <Link href="/tech/gabe" className="flex flex-col items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-xs mt-1">GABE</span>
          </Link>
          <Link href="/tech/profile" className="flex flex-col items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs mt-1">Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
