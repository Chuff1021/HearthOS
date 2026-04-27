"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface GabeMessage {
  id: string;
  timestamp: string;
  techId?: string;
  techName?: string;
  jobId?: string;
  jobNumber?: string;
  customerName?: string;
  fireplace?: string;
  messages: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }[];
  duration?: number;
  rating?: number;
  flagged?: boolean;
  flagReason?: string;
}

export default function GabeAuditPage() {
  const [messages, setMessages] = useState<GabeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<GabeMessage | null>(null);
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [techFilter, setTechFilter] = useState<string>("all");
  const [stats, setStats] = useState<{ total: number; today: number; flagged: number; avgRating?: number; techs?: { techId: string; techName: string; count: number }[] }>({ total: 0, today: 0, flagged: 0, avgRating: 0, techs: [] });
  const [testStats, setTestStats] = useState<{ passed: number; total: number; accuracy: number; failureClasses?: Record<string, number> }>({ passed: 0, total: 0, accuracy: 0 });
  const [reviewInsights, setReviewInsights] = useState<Array<{ id: string; detectedIssue: string; suggestion: string }>>([]);
  const [ops, setOps] = useState<any>(null);

  async function loadMessages() {
    setLoading(true);
    try {
      let url = "/api/gabe/messages?";
      if (filter === "flagged") url += "flagged=true&";
      if (techFilter !== "all") url += `techId=${techFilter}&`;
      
      const res = await fetch(url);
      const data = await res.json();
      setMessages(data.messages || []);
      
      // Load stats
      const statsRes = await fetch("/api/gabe/messages?stats=true");
      const statsData = await statsRes.json();
      setStats(statsData);

      // Load test-engine summary
      const testRes = await fetch('/api/gabe/test-engine');
      const testData = await testRes.json();
      setTestStats({
        passed: testData.passed || 0,
        total: testData.total || 0,
        accuracy: testData.accuracy || 0,
        failureClasses: testData.failureClasses || {},
      });

      // Load review insights
      const reviewRes = await fetch('/api/gabe/review?limit=120');
      const reviewData = await reviewRes.json();
      setReviewInsights(reviewData.insights || []);

      // Load ops/supervisor status
      const opsRes = await fetch('/api/gabe/ops/supervisor');
      const opsData = await opsRes.json();
      setOps(opsData);
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, techFilter]);

  async function handleFlag(id: string, reason: string) {
    try {
      await fetch(`/api/gabe/messages?id=${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag: true, flagReason: reason }),
      });
      loadMessages();
    } catch (error) {
      console.error("Failed to flag message:", error);
    }
  }

  async function handleRating(id: string, rating: number) {
    try {
      await fetch(`/api/gabe/messages?id=${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      loadMessages();
    } catch (error) {
      console.error("Failed to rate message:", error);
    }
  }

  function formatDate(timestamp: string) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[1600px] mx-auto space-y-5">
            {/* Page Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                  GABE AI Audit Log
                </h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Long-term conversation memory: all GABE chats are persisted to disk for post-deploy audit/review.
                </p>
              </div>
              <button 
                onClick={loadMessages}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                Refresh
              </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Conversations</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{stats.total}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Today</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#98CD00" }}>{stats.today}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Flagged for Review</p>
                <p className="text-2xl font-bold mt-1" style={{ color: stats.flagged > 0 ? "#FF204E" : "#98CD00" }}>{stats.flagged}</p>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Avg Rating</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#f8971f" }}>{(stats.avgRating || 0).toFixed(1)} ⭐</p>
              </div>
            </div>

            {/* Quality Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>GABE Test Engine</p>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(37,99,235,0.15)", color: "#93C5FD" }}>
                    {testStats.passed}/{testStats.total}
                  </span>
                </div>
                <p className="text-2xl font-bold mt-1" style={{ color: testStats.accuracy >= 90 ? "#98CD00" : "#f8971f" }}>
                  {testStats.accuracy.toFixed(1)}%
                </p>
                <div className="mt-2 text-xs space-y-1" style={{ color: "var(--color-text-muted)" }}>
                  <div>Missing terms: {testStats.failureClasses?.missingTerms || 0}</div>
                  <div>Missing citation: {testStats.failureClasses?.missingCitation || 0}</div>
                  <div>Source mismatch: {testStats.failureClasses?.sourceMismatch || 0}</div>
                </div>
              </div>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm mb-2" style={{ color: "var(--color-text-muted)" }}>Self-Refiner Recommendations</p>
                <div className="space-y-2 max-h-36 overflow-auto">
                  {reviewInsights.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No current insights.</p>
                  ) : reviewInsights.slice(0, 4).map((i) => (
                    <div key={i.id} className="text-xs rounded-lg p-2" style={{ background: "var(--color-surface-2)" }}>
                      <div className="font-semibold" style={{ color: "#f8971f" }}>{i.detectedIssue}</div>
                      <div style={{ color: "var(--color-text-secondary)" }}>{i.suggestion}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Ops Queue Panel */}
            <div className="rounded-xl p-5" style={{ background: "var(--color-surface-1)" }}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Supervisor Job Queue</h3>
                <button
                  onClick={async () => { await fetch('/api/gabe/ops/supervisor', { method: 'POST' }); loadMessages(); }}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: '#2563EB', color: '#fff' }}
                >
                  Run Supervisor Tick
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg p-3" style={{ background: "var(--color-surface-2)" }}>Active: <b>{ops?.counts?.active ?? 0}</b></div>
                <div className="rounded-lg p-3" style={{ background: "var(--color-surface-2)" }}>Queued: <b>{ops?.counts?.queued ?? 0}</b></div>
                <div className="rounded-lg p-3" style={{ background: "var(--color-surface-2)" }}>Failed: <b>{ops?.counts?.failed ?? 0}</b></div>
                <div className="rounded-lg p-3" style={{ background: "var(--color-surface-2)" }}>
                  Diagram confidence: <b>{ops?.diagramConfidence?.score ?? 0}%</b>
                </div>
              </div>
              <div className="mt-3 max-h-36 overflow-auto text-xs" style={{ color: "var(--color-text-muted)" }}>
                {(ops?.jobs || []).slice(0, 12).map((j: any) => (
                  <div key={j.id} className="py-1 border-b" style={{ borderColor: "var(--color-border)" }}>
                    {j.jobType} · {j.status} · {new Date(j.runAt).toLocaleString()}
                  </div>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as "all" | "flagged")}
                className="px-4 py-2 rounded-xl text-sm border-0 focus:ring-2 focus:ring-orange-500 outline-none"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)" }}
              >
                <option value="all">All Messages</option>
                <option value="flagged">Flagged Only</option>
              </select>
              <select
                value={techFilter}
                onChange={(e) => setTechFilter(e.target.value)}
                className="px-4 py-2 rounded-xl text-sm border-0 focus:ring-2 focus:ring-orange-500 outline-none"
                style={{ background: "var(--color-surface-1)", color: "var(--color-text-primary)" }}
              >
                <option value="all">All Technicians</option>
                {(stats.techs || []).map((t) => (
                  <option key={t.techId} value={t.techId}>{t.techName}</option>
                ))}
              </select>
            </div>

            {/* Messages List */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="p-8 text-center rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                    <p style={{ color: "var(--color-text-muted)" }}>No messages found</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className="rounded-xl overflow-hidden"
                      style={{ background: "var(--color-surface-1)" }}
                    >
                      {/* Message Header */}
                      <div 
                        className="p-4 flex items-center justify-between"
                        style={{ background: msg.flagged ? "rgba(255, 32, 78, 0.1)" : "var(--color-surface-2)" }}
                      >
                        <div className="flex items-center gap-4">
                          <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                            style={{ 
                              background: "#2563EB"
                            }}
                          >
                            {msg.techName?.split(" ").map(n => n[0]).join("") || "?"}
                          </div>
                          <div>
                            <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                              {msg.techName || "Unknown Tech"}
                            </p>
                            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                              {formatDate(msg.timestamp)} • {msg.jobNumber || "No Job"} • {msg.fireplace || "No Unit"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {msg.flagged && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                              ⚠️ Flagged
                            </span>
                          )}
                          <button
                            onClick={() => setSelectedMessage(msg)}
                            className="px-3 py-1.5 rounded-lg text-sm bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                          >
                            View
                          </button>
                        </div>
                      </div>

                      {/* Message Preview */}
                      <div className="p-4">
                        <div className="space-y-3">
                          {msg.messages.slice(0, 2).map((m, i) => (
                            <div key={i} className={`p-3 rounded-lg ${m.role === 'user' ? 'bg-blue-500/10' : 'bg-gray-500/10'}`}>
                              <p className="text-xs font-medium mb-1" style={{ color: m.role === 'user' ? '#2563EB' : '#98CD00' }}>
                                {m.role === 'user' ? '👤 Tech' : '🤖 GABE'}
                              </p>
                              <p className="text-sm line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>
                                {m.content.substring(0, 200)}...
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a2e] w-full max-w-2xl rounded-2xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Conversation Details</h2>
                <p className="text-sm text-gray-400">
                  {selectedMessage.techName} • {formatDate(selectedMessage.timestamp)}
                </p>
              </div>
              <button 
                onClick={() => setSelectedMessage(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Conversation Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedMessage.messages.map((msg, i) => (
                <div key={i} className={`p-4 rounded-xl ${msg.role === 'user' ? 'bg-blue-500/10' : 'bg-gray-700/30'}`}>
                  <p className="text-xs font-medium mb-2" style={{ color: msg.role === 'user' ? '#2563EB' : '#98CD00' }}>
                    {msg.role === 'user' ? `👤 ${selectedMessage.techName}` : '🤖 GABE AI'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>
                    {msg.content}
                  </p>
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Rate:</span>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => handleRating(selectedMessage.id, star)}
                    className="text-xl hover:scale-110 transition-transform"
                    style={{ color: star <= (selectedMessage.rating || 0) ? "#f8971f" : "#4b5563" }}
                  >
                    ⭐
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const reason = prompt("Enter reason for flagging:");
                    if (reason) handleFlag(selectedMessage.id, reason);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  Flag for Review
                </button>
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-white hover:bg-gray-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
