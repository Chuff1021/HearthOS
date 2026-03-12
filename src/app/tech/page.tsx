"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/auth";
import TechBottomNav from "@/components/tech/TechBottomNav";

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

function TechAppContent({ displayName }: { displayName: string }) {
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [shiftStartTime, setShiftStartTime] = useState<Date | null>(null);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [jobStartTime, setJobStartTime] = useState<Date | null>(null);

  const handleClockIn = () => {
    if (!isClockedIn) {
      setIsClockedIn(true);
      setShiftStartTime(new Date());
    } else {
      setIsClockedIn(false);
      setShiftStartTime(null);
      setActiveJob(null);
      setJobStartTime(null);
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
    <div className="flex flex-col min-h-screen pb-32">
      {/* Header */}
      <header
        className="sticky top-0 z-10 px-4 pb-4"
        style={{
          paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.75rem))",
          background: "color-mix(in srgb, var(--color-surface-1) 92%, #fff)",
          borderBottom: "1px solid rgba(255,106,0,0.12)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <Image
              src="/tech/hearthos-logo.svg"
              alt="HearthOS"
              width={172}
              height={32}
              priority
              className="h-8 w-auto"
            />
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Tech Dashboard · {displayName}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* GABE AI Button */}
            <Link
              href="/tech/gabe"
              className="p-2 rounded-full text-white"
              style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)" }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </Link>
            {/* GPS Status */}
            <div className="flex items-center gap-1 text-xs" style={{ color: "#15803D" }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#16A34A" }}></div>
              GPS
            </div>
          </div>
        </div>
      </header>

      {/* Clock In/Out Section */}
      <div
        className="p-4 mx-4 mt-4 rounded-xl"
        style={{
          background: "var(--color-surface-1)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-subtle)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Shift Status</p>
            {isClockedIn && shiftStartTime && (
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Started: {formatTime(shiftStartTime)}
              </p>
            )}
          </div>
          <button
            onClick={handleClockIn}
            className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
              isClockedIn
                ? "bg-red-500/20 text-red-400 border border-red-500/50"
                : "text-white"
            }`}
            style={!isClockedIn ? { background: "linear-gradient(135deg, #FF6A00, #F59E0B)" } : undefined}
          >
            {isClockedIn ? "Clock Out" : "Clock In"}
          </button>
        </div>
      </div>

      {/* Active Job Banner */}
      {activeJob && jobStartTime && (
        <div
          className="mx-4 mt-3 p-3 rounded-xl"
          style={{
            background: "linear-gradient(135deg, rgba(255,106,0,0.12), rgba(245,158,11,0.08))",
            border: "1px solid rgba(255,106,0,0.24)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium" style={{ color: "#C2410C" }}>Active Job</p>
              <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {mockJobs.find((j) => j.id === activeJob)?.customer}
              </p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Started: {formatTime(jobStartTime)}
              </p>
            </div>
            <Link
              href={`/tech/job/${activeJob}`}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)" }}
            >
              View Job
            </Link>
          </div>
        </div>
      )}

      {/* Today's Jobs */}
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>Today&apos;s Jobs</h2>
        <div className="space-y-3">
          {mockJobs.map((job) => (
            <div
              key={job.id}
              className="rounded-xl p-4"
              style={{
                background: "var(--color-surface-1)",
                border: activeJob === job.id ? "1px solid rgba(255,106,0,0.28)" : "1px solid var(--color-border)",
                boxShadow: "var(--shadow-subtle)",
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{job.customer}</h3>
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{job.type}</p>
                </div>
                <span className="text-sm font-medium" style={{ color: "#C2410C" }}>
                  {job.scheduled}
                </span>
              </div>
              <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>{job.address}</p>
              <div className="flex items-center gap-2">
                <Link
                  href={`/tech/job/${job.id}`}
                  className="flex-1 text-center py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: "var(--color-surface-3)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border)",
                  }}
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
                      ? "text-white"
                      : "bg-gray-700 text-gray-500 cursor-not-allowed"
                  }`}
                  style={activeJob !== job.id && isClockedIn ? { background: "linear-gradient(135deg, #FF6A00, #F59E0B)" } : undefined}
                >
                  {activeJob === job.id ? "End Job" : "Start Job"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <TechBottomNav active="jobs" />
    </div>
  );
}

function TechAppWithClerk() {
  const { user } = useUser();
  const displayName = user?.firstName || user?.fullName || "Tech";

  return <TechAppContent displayName={displayName} />;
}

export default function TechApp() {
  if (!CLERK_ENABLED) {
    return <TechAppContent displayName="Tech" />;
  }

  return <TechAppWithClerk />;
}
