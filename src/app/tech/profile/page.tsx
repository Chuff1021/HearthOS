"use client";

import { useState } from "react";
import Link from "next/link";

export default function ProfilePage() {
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [isTracking, setIsTracking] = useState(true);

  // Derived state — no useEffect needed
  const currentLocation = gpsEnabled && isTracking ? "Springfield, IL" : null;

  const user = {
    name: "Mike Johnson",
    email: "mike@hearthos.com",
    phone: "(555) 123-4567",
    role: "Service Technician",
    employeeId: "EMP-001",
  };

  const todayStats = {
    jobsCompleted: 2,
    hoursWorked: "5h 32m",
    milesDriven: 47,
    clockIn: "7:45 AM",
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Header */}
      <header className="bg-[#1a1a2e] p-4 sticky top-0 z-10">
        <h1 className="text-lg font-semibold">Profile</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* User Info */}
        <div className="bg-[#1a1a2e] rounded-xl p-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full flex items-center justify-center text-2xl font-bold">
              {user.name.split(" ").map((n) => n[0]).join("")}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{user.name}</h2>
              <p className="text-sm text-gray-400">{user.role}</p>
              <p className="text-xs text-gray-500">{user.employeeId}</p>
            </div>
          </div>
        </div>

        {/* Today's Stats */}
        <div className="bg-[#1a1a2e] rounded-xl p-4">
          <h3 className="font-semibold mb-3">Today&apos;s Activity</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#252540] rounded-lg p-3">
              <p className="text-2xl font-bold text-orange-400">{todayStats.jobsCompleted}</p>
              <p className="text-xs text-gray-400">Jobs Done</p>
            </div>
            <div className="bg-[#252540] rounded-lg p-3">
              <p className="text-2xl font-bold text-orange-400">{todayStats.hoursWorked}</p>
              <p className="text-xs text-gray-400">Hours Worked</p>
            </div>
            <div className="bg-[#252540] rounded-lg p-3">
              <p className="text-2xl font-bold text-orange-400">{todayStats.milesDriven}</p>
              <p className="text-xs text-gray-400">Miles Driven</p>
            </div>
            <div className="bg-[#252540] rounded-lg p-3">
              <p className="text-2xl font-bold text-orange-400">{todayStats.clockIn}</p>
              <p className="text-xs text-gray-400">Clocked In</p>
            </div>
          </div>
        </div>

        {/* GPS Tracking */}
        <div className="bg-[#1a1a2e] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">GPS Tracking</h3>
            <div className={`flex items-center gap-1 text-xs ${isTracking ? "text-green-400" : "text-gray-500"}`}>
              <div className={`w-2 h-2 rounded-full ${isTracking ? "bg-green-400 animate-pulse" : "bg-gray-500"}`}></div>
              {isTracking ? "Active" : "Inactive"}
            </div>
          </div>
          
          {currentLocation && (
            <div className="bg-[#252540] rounded-lg p-3 mb-3">
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
        <div className="bg-[#1a1a2e] rounded-xl p-4">
          <h3 className="font-semibold mb-3">Contact Information</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Email</span>
              <span className="text-sm">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Phone</span>
              <span className="text-sm">{user.phone}</span>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="space-y-2">
          <button className="w-full bg-[#1a1a2e] rounded-xl p-4 text-left flex items-center justify-between">
            <span>Time History</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button className="w-full bg-[#1a1a2e] rounded-xl p-4 text-left flex items-center justify-between">
            <span>Job History</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button className="w-full bg-[#1a1a2e] rounded-xl p-4 text-left flex items-center justify-between">
            <span>Settings</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Logout */}
        <button className="w-full bg-red-500/20 text-red-400 rounded-xl p-4 font-medium border border-red-500/50">
          Sign Out
        </button>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1a2e] border-t border-gray-800 z-20">
        <div className="max-w-md mx-auto flex justify-around py-3">
          <Link href="/tech" className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1">Jobs</span>
          </Link>
          <Link href="/tech/manuals" className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-xs mt-1">Manuals</span>
          </Link>
          <Link href="/tech/gabe" className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-xs mt-1">GABE</span>
          </Link>
          <Link href="/tech/profile" className="flex flex-col items-center text-orange-400">
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
