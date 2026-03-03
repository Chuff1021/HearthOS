"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import TechBottomNav from "@/components/tech/TechBottomNav";

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [techId, setTechId] = useState<string>("");
  const [requestType, setRequestType] = useState<"paid_vacation" | "unpaid_vacation" | "unpaid_appointment_time">("paid_vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestStatus, setRequestStatus] = useState<string>("");

  const handleSignOut = async () => {
    // Sign out and redirect to sign-in page
    window.location.href = "/sign-out";
  };

  // Use Clerk user data if available, otherwise use mock data
  const userName = user?.fullName || user?.username || "Service Tech";
  const userEmail = user?.primaryEmailAddress?.emailAddress || "tech@hearthos.com";
  const userInitials = userName.split(" ").map(n => n[0]).join("").toUpperCase();
  const [isTracking, setIsTracking] = useState(true);

  // Derived state — no useEffect needed
  const currentLocation = gpsEnabled && isTracking ? "Springfield, IL" : null;

  useEffect(() => {
    async function resolveTech() {
      try {
        const res = await fetch('/api/techs?activeOnly=true');
        const data = await res.json();
        const list = data.techs || [];
        const nameLower = (user?.fullName || user?.firstName || '').toLowerCase();
        const match = list.find((t: any) => nameLower && nameLower.includes(String(t.name).split(' ')[0].toLowerCase()));
        if (match) setTechId(match.id);
      } catch {
        // no-op
      }
    }
    resolveTech();
  }, [user?.firstName, user?.fullName]);

  async function submitTimeOffRequest() {
    if (!techId || !startDate || !endDate) {
      setRequestStatus('Please select dates first.');
      return;
    }

    const res = await fetch('/api/time-off-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        techId,
        techName: userName,
        type: requestType,
        startDate,
        endDate,
        reason: requestReason || undefined,
      }),
    });

    if (res.ok) {
      setRequestStatus('Request submitted.');
      setRequestReason('');
    } else {
      const data = await res.json().catch(() => ({}));
      setRequestStatus(data.error || 'Failed to submit request.');
    }
  }

  // User info from Clerk or defaults
  const todayStats = {
    jobsCompleted: 2,
    hoursWorked: "5h 32m",
    milesDriven: 47,
    clockIn: "7:45 AM",
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Header */}
      <header className="bg-[var(--color-surface-1)] p-4 sticky top-0 z-10">
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

        {/* GPS Tracking */}
        <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">GPS Tracking</h3>
            <div className={`flex items-center gap-1 text-xs ${isTracking ? "text-green-400" : "text-gray-500"}`}>
              <div className={`w-2 h-2 rounded-full ${isTracking ? "bg-green-400 animate-pulse" : "bg-gray-500"}`}></div>
              {isTracking ? "Active" : "Inactive"}
            </div>
          </div>
          
          {currentLocation && (
            <div className="bg-[var(--color-surface-3)] rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium">Current Location</p>
                  <p className="text-xs text-gray-400">{currentLocation}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable GPS</p>
                <p className="text-xs text-gray-400">Allow location tracking</p>
              </div>
              <button
                onClick={() => setGpsEnabled(!gpsEnabled)}
                className={`w-12 h-7 rounded-full transition-colors ${gpsEnabled ? "bg-green-500" : "bg-gray-600"}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${gpsEnabled ? "translate-x-6" : "translate-x-1"}`}></div>
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Live Tracking</p>
                <p className="text-xs text-gray-400">Share location with dispatch</p>
              </div>
              <button
                onClick={() => setIsTracking(!isTracking)}
                className={`w-12 h-7 rounded-full transition-colors ${isTracking ? "bg-green-500" : "bg-gray-600"}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${isTracking ? "translate-x-6" : "translate-x-1"}`}></div>
              </button>
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
              onChange={(e) => setRequestType(e.target.value as any)}
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
          <button onClick={() => router.push('/admin/time')} className="w-full bg-[var(--color-surface-1)] rounded-xl p-4 text-left flex items-center justify-between">
            <span>Time History</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={() => router.push('/tech')} className="w-full bg-[var(--color-surface-1)] rounded-xl p-4 text-left flex items-center justify-between">
            <span>Job History</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={() => router.push('/settings')} className="w-full bg-[var(--color-surface-1)] rounded-xl p-4 text-left flex items-center justify-between">
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
