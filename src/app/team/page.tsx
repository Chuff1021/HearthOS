"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface Tech {
  id: string;
  name: string;
  email: string;
  phone: string;
  color: string;
  initials: string;
  role: "lead" | "tech" | "helper" | "dispatcher" | "admin";
  active: boolean;
  skills: string[];
  certifications: string[];
  hireDate: string;
  availability: "available" | "on_job" | "off" | "vacation";
  currentJob?: {
    id: string;
    title: string;
    customer: string;
  };
}

export default function TeamPage() {
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTech, setSelectedTech] = useState<Tech | null>(null);
  const [filter, setFilter] = useState<"all" | "available" | "on_job" | "off">("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ name: "", email: "", phone: "", role: "tech" as "lead" | "tech" | "helper" | "dispatcher" | "admin" });
  const [resendingFor, setResendingFor] = useState<string | null>(null);

  async function loadTechs() {
    setLoading(true);
    try {
      const res = await fetch("/api/techs?activeOnly=false");
      const data = await res.json();
      
      const techsWithAvailability: Tech[] = (data.techs || []).map((t: any) => ({
        ...t,
        availability: t.active ? "available" : "off" as const,
        currentJob: undefined,
      }));

      setTechs(techsWithAvailability);
    } catch (error) {
      console.error("Failed to load techs:", error);
    }
    setLoading(false);
  }

  async function deleteTech(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/techs?id=${id}`, {
        method: "DELETE",
      });
      
      if (res.ok) {
        setTechs(techs.filter((t) => t.id !== id));
        setSelectedTech(null);
        setShowDeleteConfirm(false);
      } else {
        alert("Failed to delete technician");
      }
    } catch (error) {
      console.error("Failed to delete tech:", error);
      alert("Failed to delete technician");
    }
    setDeleting(false);
  }

  async function addTeamMember() {
    setAddError(null);
    setAddSuccess(null);

    const payload = {
      ...newMember,
      name: newMember.name.trim(),
      email: newMember.email.trim().toLowerCase(),
      phone: newMember.phone.trim(),
    };

    if (!payload.name || !payload.email) {
      setAddError("Name and email are required.");
      return;
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email);
    if (!emailOk) {
      setAddError("Please enter a valid email address.");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/techs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add team member');

      setShowAddModal(false);
      const inviteSent = data?.invite?.sent;
      const existing = data?.exists;
      if (inviteSent) {
        setAddSuccess(`${existing ? 'Member exists; invite re-sent' : `Added ${payload.name}`} — Clerk invite email sent.`);
      } else {
        setAddSuccess(`${existing ? 'Member exists' : `Added ${payload.name}`} — invite not sent (${data?.invite?.reason || 'not configured'}).`);
      }
      setNewMember({ name: '', email: '', phone: '', role: 'tech' });
      await loadTechs();
    } catch (error) {
      console.error('Failed to add member:', error);
      setAddError(error instanceof Error ? error.message : 'Failed to add team member');
    }
    setAdding(false);
  }

  async function resendInvite(tech: Tech) {
    setAddError(null);
    setAddSuccess(null);
    setResendingFor(tech.id);
    try {
      const res = await fetch('/api/techs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tech.name,
          email: tech.email,
          phone: tech.phone,
          role: tech.role,
          color: tech.color,
          skills: tech.skills,
          certifications: tech.certifications,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to resend invite');

      if (data?.invite?.sent) {
        setAddSuccess(`Invite re-sent to ${tech.email}.`);
      } else {
        setAddError(`Invite not sent for ${tech.email}: ${data?.invite?.reason || 'not configured'}`);
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to resend invite');
    } finally {
      setResendingFor(null);
    }
  }

  useEffect(() => {
    loadTechs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getAvailabilityColor(availability: string) {
    switch (availability) {
      case "available": return "bg-green-500";
      case "on_job": return "bg-blue-500";
      case "off": return "bg-gray-500";
      case "vacation": return "bg-yellow-500";
    }
  }

  function getRoleBadge(role: string) {
    switch (role) {
      case "lead": return "bg-purple-500/20 text-purple-400";
      case "dispatcher": return "bg-orange-500/20 text-orange-400";
      case "admin": return "bg-red-500/20 text-red-400";
      default: return "bg-blue-500/20 text-blue-400";
    }
  }

  const filteredTechs = filter === "all" ? techs : techs.filter(t => t.availability === filter);
  const availableCount = techs.filter(t => t.availability === "available").length;
  const onJobCount = techs.filter(t => t.availability === "on_job").length;

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
                  Team
                </h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Manage technicians and staff
                </p>
                <p className="text-[11px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Build: team-fix-2026-03-03-2230
                </p>
              </div>
              <button 
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                + Add Team Member
              </button>
            </div>

            {addSuccess && (
              <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(152,205,0,0.12)", border: "1px solid rgba(152,205,0,0.35)", color: "#98CD00" }}>
                {addSuccess}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Total Team</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{techs.length}</p>
              </div>
              <button
                onClick={() => setFilter("available")}
                className={`p-5 rounded-xl text-left transition-all ${filter === "available" ? "ring-2 ring-green-500" : ""}`}
                style={{ background: "var(--color-surface-1)" }}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Available</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#98CD00" }}>{availableCount}</p>
              </button>
              <button
                onClick={() => setFilter("on_job")}
                className={`p-5 rounded-xl text-left transition-all ${filter === "on_job" ? "ring-2 ring-blue-500" : ""}`}
                style={{ background: "var(--color-surface-1)" }}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>On Job</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#2563EB" }}>{onJobCount}</p>
              </button>
              <div className="p-5 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Off Duty</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#6b7280" }}>
                  {techs.filter(t => t.availability === "off" || t.availability === "vacation").length}
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
              {[
                { id: "all", label: "All" },
                { id: "available", label: "Available" },
                { id: "on_job", label: "On Job" },
                { id: "off", label: "Off Duty" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === tab.id 
                      ? "bg-orange-500 text-white" 
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Team Grid */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTechs.map((tech) => (
                  <div 
                    key={tech.id}
                    className="p-5 rounded-xl cursor-pointer hover:ring-2 hover:ring-orange-500 transition-all"
                    style={{ background: "var(--color-surface-1)" }}
                    onClick={() => setSelectedTech(tech)}
                  >
                    <div className="flex items-start gap-4">
                      <div className="relative">
                        <div 
                          className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg"
                          style={{ background: tech.color }}
                        >
                          {tech.initials}
                        </div>
                        <div 
                          className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#1a1a2e] ${getAvailabilityColor(tech.availability)}`}
                        ></div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{tech.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadge(tech.role)}`}>
                            {tech.role}
                          </span>
                          {!tech.active && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{tech.email}</p>
                          <button
                            onClick={(e) => { e.stopPropagation(); resendInvite(tech); }}
                            className="px-2 py-0.5 rounded text-[11px]"
                            style={{ border: "1px solid var(--color-border)", color: "#93C5FD" }}
                          >
                            {resendingFor === tech.id ? 'Sending…' : 'Resend Login'}
                          </button>
                        </div>
                        
                        {tech.currentJob && (
                          <div className="mt-2 p-2 rounded-lg bg-blue-500/10">
                            <p className="text-xs text-blue-400">Currently on:</p>
                            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{tech.currentJob.title}</p>
                            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{tech.currentJob.customer}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Skills */}
                    <div className="mt-4 flex flex-wrap gap-1">
                      {tech.skills.slice(0, 3).map((skill) => (
                        <span key={skill} className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">
                          {skill}
                        </span>
                      ))}
                      {tech.skills.length > 3 && (
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">
                          +{tech.skills.length - 3} more
                        </span>
                      )}
                    </div>
                    
                    {/* Certifications */}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {tech.certifications.slice(0, 2).map((cert) => (
                        <span key={cert} className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400">
                          ✓ {cert}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Tech Detail Modal */}
      {selectedTech && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a2e] w-full max-w-lg rounded-2xl p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl"
                  style={{ background: selectedTech.color }}
                >
                  {selectedTech.initials}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedTech.name}</h2>
                  <p className="text-gray-400 capitalize">{selectedTech.role}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTech(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Status */}
            <div className="mb-6">
              <label className="text-sm text-gray-400">Current Status</label>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-3 h-3 rounded-full ${getAvailabilityColor(selectedTech.availability)}`}></div>
                <span className="font-medium capitalize">{selectedTech.availability.replace("_", " ")}</span>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-sm text-gray-400">Email</label>
                <p className="font-medium">{selectedTech.email}</p>
              </div>
              <div>
                <label className="text-sm text-gray-400">Phone</label>
                <p className="font-medium">{selectedTech.phone}</p>
              </div>
              <div>
                <label className="text-sm text-gray-400">Hire Date</label>
                <p className="font-medium">{new Date(selectedTech.hireDate).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Skills */}
            <div className="mb-6">
              <label className="text-sm text-gray-400 mb-2 block">Skills</label>
              <div className="flex flex-wrap gap-2">
                {selectedTech.skills.map((skill) => (
                  <span key={skill} className="px-3 py-1 rounded-full text-sm bg-gray-700 text-gray-300">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Certifications */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Certifications</label>
              <div className="flex flex-wrap gap-2">
                {selectedTech.certifications.map((cert) => (
                  <span key={cert} className="px-3 py-1 rounded-full text-sm bg-green-500/10 text-green-400">
                    ✓ {cert}
                  </span>
                ))}
                {selectedTech.certifications.length === 0 && (
                  <p className="text-gray-500 text-sm">No certifications</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6 pt-6 border-t border-gray-700">
              <button className="flex-1 py-2 rounded-lg font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                Edit Profile
              </button>
              <button className="px-4 py-2 rounded-lg font-medium bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                View Schedule
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Team Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Add Team Member</h2>
              <button 
                onClick={() => setShowAddModal(false)}
                className="hover:text-white"
                style={{ color: "var(--color-text-muted)" }}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              {addError && (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,32,78,0.12)", border: "1px solid rgba(255,32,78,0.35)", color: "#FF204E" }}>
                  {addError}
                </div>
              )}
              {addSuccess && (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(152,205,0,0.12)", border: "1px solid rgba(152,205,0,0.35)", color: "#98CD00" }}>
                  {addSuccess}
                </div>
              )}
              <input
                type="text"
                placeholder="Full Name"
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border focus:border-blue-600 outline-none"
                style={{ color: "var(--color-text-primary)", background: "var(--color-surface-3)", borderColor: "var(--color-border)" }}
              />
              <input
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Email"
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border focus:border-blue-600 outline-none"
                style={{ color: "var(--color-text-primary)", background: "var(--color-surface-3)", borderColor: "var(--color-border)" }}
              />
              <input
                type="tel"
                placeholder="Phone"
                value={newMember.phone}
                onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border focus:border-blue-600 outline-none"
                style={{ color: "var(--color-text-primary)", background: "var(--color-surface-3)", borderColor: "var(--color-border)" }}
              />
              <select
                value={newMember.role}
                onChange={(e) => setNewMember({ ...newMember, role: e.target.value as any })}
                className="w-full px-4 py-2 rounded-xl border focus:border-blue-600 outline-none"
                style={{ color: "var(--color-text-primary)", background: "var(--color-surface-3)", borderColor: "var(--color-border)" }}
              >
                <option value="tech">Technician</option>
                <option value="lead">Lead Technician</option>
                <option value="helper">Helper</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            
            <button
              onClick={addTeamMember}
              disabled={adding}
              className="w-full mt-6 py-3 rounded-xl font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-60"
            >
              {adding ? 'Adding...' : 'Add Team Member'}
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedTech && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a2e] w-full max-w-sm rounded-2xl p-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold mb-2">Delete Team Member?</h3>
              <p className="text-gray-400 mb-6">
                Are you sure you want to delete <span className="text-white font-medium">{selectedTech.name}</span>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 rounded-lg font-medium bg-gray-700 text-white hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteTech(selectedTech.id)}
                  disabled={deleting}
                  className="flex-1 py-2 rounded-lg font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
