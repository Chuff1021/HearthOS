"use client";

import { useEffect, useRef, useState } from "react";
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
  const [locationLabel, setLocationLabel] = useState<string>("Waiting for GPS...");
  const [gpsError, setGpsError] = useState<string>("");
  const [gpsState, setGpsState] = useState<string>("unknown");
  const [lastGpsPingAt, setLastGpsPingAt] = useState<string>("");
  const [techLinkStatus, setTechLinkStatus] = useState<string>("");
  const watchRef = useRef<number | null>(null);

  const handleSignOut = async () => {
    // Sign out and redirect to sign-in page
    window.location.href = "/sign-out";
  };

  // Use Clerk user data if available, otherwise use mock data
  const userName = user?.fullName || user?.username || "Service Tech";
  const userEmail = user?.primaryEmailAddress?.emailAddress || "tech@hearthos.com";
  const userInitials = userName.split(" ").map(n => n[0]).join("").toUpperCase();
  const [isTracking, setIsTracking] = useState(true);

  // Derived state
  const currentLocation = gpsEnabled && isTracking ? locationLabel : null;

  async function ensureTechProfile(forceCreate = false) {
    try {
      if (!isLoaded) return;
      setTechLinkStatus('Linking tech account...');

      // 1) Persistent account-linked tech ID (strongest mapping)
      const linkedTechId = user?.unsafeMetadata?.techId as string | undefined;
      if (linkedTechId && !forceCreate) {
        setTechId(linkedTechId);
        setTechLinkStatus('Tech linked via account metadata.');
        return;
      }

      const res = await fetch('/api/techs?activeOnly=true');
      const data = await res.json();
      const list = data.techs || [];

      // 2) Exact email match
      const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
      let match = email ? list.find((t: any) => String(t.email || '').toLowerCase() === email) : null;

      // 3) Full name/first-name fallback
      if (!match) {
        const nameLower = (user?.fullName || user?.firstName || '').toLowerCase();
        match = list.find((t: any) =>
          nameLower && (
            String(t.name || '').toLowerCase() === nameLower ||
            nameLower.includes(String(t.name || '').split(' ')[0].toLowerCase())
          )
        );
      }

      if (match && !forceCreate) {
        setTechId(match.id);
        setTechLinkStatus(`Tech linked: ${match.name}`);
        return;
      }

      // 4) Auto-create a tech profile for logged-in user if no match exists
      const autoName = (user?.fullName || user?.firstName || '').trim();
      const autoEmail = (user?.primaryEmailAddress?.emailAddress || '').trim().toLowerCase();
      if (autoName && autoEmail) {
        const createRes = await fetch('/api/techs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: autoName, email: autoEmail, phone: '', role: 'tech' }),
        });
        const createData = await createRes.json().catch(() => ({}));
        if (createRes.ok && createData?.tech?.id) {
          setTechId(createData.tech.id);
          setTechLinkStatus(`Tech profile ready: ${createData.tech.name}`);
          return;
        }
      }

      setTechLinkStatus('Unable to auto-link tech profile. Use Register button below.');
    } catch {
      setTechLinkStatus('Tech linking failed. Tap Register as Tech.');
    }
  }

  useEffect(() => {
    ensureTechProfile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user?.firstName, user?.fullName, user?.id, user?.unsafeMetadata, user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    if (!gpsEnabled || !isTracking) {
      if (watchRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation not supported on this device/browser.');
      return;
    }

    const effectiveTechId = techId || user?.id || `user-${(userName || 'unknown').toLowerCase().replace(/\s+/g, '-')}`;

    setGpsError('');
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        setLocationLabel(`${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`);
        setGpsState('active');
        setLastGpsPingAt(new Date().toISOString());

        const pingRes = await fetch('/api/tech/locations', {
          cache: 'no-store',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            techId: effectiveTechId,
            techName: userName,
            lat: latitude,
            lng: longitude,
            accuracy,
            speed,
            heading,
            timestamp: new Date(pos.timestamp).toISOString(),
          }),
        });

        if (!pingRes.ok) {
          const data = await pingRes.json().catch(() => ({}));
          setGpsError(data.error || 'Failed to send GPS ping to dispatch.');
        }
      },
      (err) => {
        setGpsState('error');
        setGpsError(err.message || 'GPS permission denied/unavailable.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      }
    );

    return () => {
      if (watchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [gpsEnabled, isTracking, techId, user?.id, userName]);

  async function requestLocationPermission() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation not supported.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsState('permission_granted');
        setGpsError('');
        setLocationLabel(`${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`);
      },
      (err) => {
        setGpsState('permission_denied');
        setGpsError(err.message || 'Location permission denied.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

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
          {gpsError && (
            <div className="bg-red-500/15 border border-red-500/30 rounded-lg p-2 mb-3 text-xs text-red-300">
              {gpsError}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={requestLocationPermission}
              className="w-full py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            >
              Request Location Permission
            </button>
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              GPS State: {gpsState} {lastGpsPingAt ? `· Last Ping: ${new Date(lastGpsPingAt).toLocaleTimeString()}` : ''}
            </div>
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Tracking As: {techId || user?.id || 'unresolved'}
            </div>
            <div className="text-xs" style={{ color: techId ? '#98CD00' : 'var(--color-text-muted)' }}>
              {techLinkStatus || (techId ? 'Tech profile linked.' : 'Tech profile not linked yet.')}
            </div>
            <button
              onClick={() => ensureTechProfile(true)}
              className="w-full py-2 rounded-lg text-sm font-medium"
              style={{ background: '#2563EB', color: 'white' }}
            >
              Register Me as Tech
            </button>

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
