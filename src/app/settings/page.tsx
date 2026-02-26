"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("organization");

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[1200px] mx-auto space-y-5">
            {/* Page Header */}
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                Settings
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Manage your organization and account settings
              </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b" style={{ borderColor: "var(--color-border)" }}>
              {[
                { id: "organization", label: "Organization", icon: "🏢" },
                { id: "notifications", label: "Notifications", icon: "🔔" },
                { id: "billing", label: "Billing", icon: "💳" },
                { id: "integrations", label: "Integrations", icon: "🔗" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id 
                      ? "border-orange-500 text-orange-500" 
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Organization Settings */}
            {activeTab === "organization" && (
              <div className="space-y-6">
                <div className="p-6 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                  <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>
                    Company Information
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
                        Company Name
                      </label>
                      <input
                        type="text"
                        defaultValue="HearthOS Fireplace Services"
                        className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                        style={{ color: "var(--color-text-primary)" }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
                        Phone
                      </label>
                      <input
                        type="tel"
                        defaultValue="(555) 123-4567"
                        className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                        style={{ color: "var(--color-text-primary)" }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
                        Email
                      </label>
                      <input
                        type="email"
                        defaultValue="info@hearthos.com"
                        className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                        style={{ color: "var(--color-text-primary)" }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
                        Website
                      </label>
                      <input
                        type="url"
                        defaultValue="https://hearthos.com"
                        className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                        style={{ color: "var(--color-text-primary)" }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
                        Address
                      </label>
                      <input
                        type="text"
                        defaultValue="123 Fireplace Lane, Denver, CO 80202"
                        className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                        style={{ color: "var(--color-text-primary)" }}
                      />
                    </div>
                  </div>
                  <button className="mt-4 px-4 py-2 rounded-lg font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                    Save Changes
                  </button>
                </div>

                <div className="p-6 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                  <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>
                    Business Hours
                  </h2>
                  <div className="space-y-3">
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                      <div key={day} className="flex items-center gap-4">
                        <span className="w-24 text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>{day}</span>
                        <input
                          type="time"
                          defaultValue="08:00"
                          className="px-3 py-1.5 rounded-lg bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                          style={{ color: "var(--color-text-primary)" }}
                        />
                        <span style={{ color: "var(--color-text-muted)" }}>to</span>
                        <input
                          type="time"
                          defaultValue={day === "Saturday" || day === "Sunday" ? "12:00" : "17:00"}
                          className="px-3 py-1.5 rounded-lg bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                          style={{ color: "var(--color-text-primary)" }}
                        />
                        <label className="flex items-center gap-2 ml-auto">
                          <input type="checkbox" defaultChecked={day !== "Sunday"} className="rounded" />
                          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>Open</span>
                        </label>
                      </div>
                    ))}
                  </div>
                  <button className="mt-4 px-4 py-2 rounded-lg font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                    Save Hours
                  </button>
                </div>
              </div>
            )}

            {/* Notifications Settings */}
            {activeTab === "notifications" && (
              <div className="p-6 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>
                  Notification Preferences
                </h2>
                <div className="space-y-4">
                  {[
                    { label: "New job assigned", description: "When a technician is assigned to a new job" },
                    { label: "Job status updates", description: "When a job status changes" },
                    { label: "Invoice payments", description: "When payments are received" },
                    { label: "Overdue invoices", description: "When invoices become overdue" },
                    { label: "Low inventory alerts", description: "When inventory items are low" },
                    { label: "Daily schedule summary", description: "Morning summary of the day's jobs" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-lg" style={{ background: "var(--color-surface-2)" }}>
                      <div>
                        <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{item.label}</p>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{item.description}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Billing Settings */}
            {activeTab === "billing" && (
              <div className="p-6 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>
                  Subscription & Billing
                </h2>
                <div className="p-4 rounded-lg bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-orange-400">Professional Plan</p>
                      <p className="text-sm text-gray-400">Unlimited technicians, jobs, and customers</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-500/20 text-green-400">Active</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
                      Billing Email
                    </label>
                    <input
                      type="email"
                      defaultValue="billing@hearthos.com"
                      className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                      style={{ color: "var(--color-text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
                      Payment Method
                    </label>
                    <div className="p-4 rounded-lg flex items-center gap-3" style={{ background: "var(--color-surface-2)" }}>
                      <span className="text-2xl">💳</span>
                      <div className="flex-1">
                        <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>Visa ending in 4242</p>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Expires 12/2027</p>
                      </div>
                      <button className="text-sm text-orange-400 hover:text-orange-300">Update</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Integrations */}
            {activeTab === "integrations" && (
              <div className="space-y-4">
                <div className="p-6 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <span className="text-2xl">📗</span>
                      </div>
                      <div>
                        <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>QuickBooks Online</h3>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Sync customers, invoices, and payments</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-500/20 text-green-400">Connected</span>
                  </div>
                </div>

                <div className="p-6 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <span className="text-2xl">📘</span>
                      </div>
                      <div>
                        <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Google Calendar</h3>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Sync schedules with Google Calendar</p>
                      </div>
                    </div>
                    <button className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                      Connect
                    </button>
                  </div>
                </div>

                <div className="p-6 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <span className="text-2xl">📱</span>
                      </div>
                      <div>
                        <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>SMS Notifications</h3>
                        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Send text messages to customers</p>
                      </div>
                    </div>
                    <button className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                      Setup
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
