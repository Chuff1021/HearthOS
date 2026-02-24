"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// Mock job data
const mockJobData = {
  id: "1",
  customer: "Johnson Residence",
  address: "123 Oak Street, Springfield, IL 62701",
  phone: "(555) 123-4567",
  email: "johnson@email.com",
  fireplace: "Regency F1100 Gas Insert",
  type: "Annual Inspection",
  scheduled: "9:00 AM",
  notes: "Customer mentioned pilot light issues. Dog in backyard - use front gate.",
  customerNotes: [
    { date: "2025-11-15", note: "Annual inspection completed - all clear" },
    { date: "2025-08-20", note: "Replaced thermocouple" },
  ],
  estimates: [
    { id: "E001", date: "2025-11-15", amount: 450, status: "approved" },
  ],
  invoices: [
    { id: "INV-001", date: "2025-11-15", amount: 189, status: "paid" },
  ],
  photos: [
    { id: "p1", url: "/placeholder-photo.jpg", caption: "Unit before service", date: "2025-11-15" },
  ],
};

const inspectionChecklist = [
  { id: 1, task: "Visual inspection of unit exterior", required: true, photo: false },
  { id: 2, task: "Check pilot light and ignition", required: true, photo: false },
  { id: 3, task: "Inspect gas lines for leaks", required: true, photo: true },
  { id: 4, task: "Clean glass and interior", required: true, photo: true },
  { id: 5, task: "Check venting system", required: true, photo: true },
  { id: 6, task: "Test thermostat/remote", required: true, photo: false },
  { id: 7, task: "Verify proper combustion", required: true, photo: false },
  { id: 8, task: "Final photo of completed work", required: true, photo: true },
];

const installationChecklist = [
  { id: 1, task: "Verify unit matches order", required: true, photo: true },
  { id: 2, task: "Install gas line connection", required: true, photo: true },
  { id: 3, task: "Install venting system", required: true, photo: true },
  { id: 4, task: "Connect electrical", required: true, photo: true },
  { id: 5, task: "Test all functions", required: true, photo: false },
  { id: 6, task: "Customer walkthrough", required: true, photo: false },
  { id: 7, task: "Final installation photo", required: true, photo: true },
];

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [activeTab, setActiveTab] = useState<"details" | "checklist" | "photos" | "customer">("details");
  const [checklistItems, setChecklistItems] = useState<Record<number, boolean>>({});
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const job = mockJobData;
  const checklist = job.type === "Annual Inspection" ? inspectionChecklist : installationChecklist;

  const handleCheckItem = (id: number) => {
    setChecklistItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(checklistItems).filter(Boolean).length;
  const progress = Math.round((completedCount / checklist.length) * 100);

  const handlePhotoCapture = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Header */}
      <header className="bg-[#1a1a2e] p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/tech" className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{job.customer}</h1>
            <p className="text-xs text-gray-400">{job.type}</p>
          </div>
          <a href={`tel:${job.phone}`} className="bg-green-500 p-2 rounded-full">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </a>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-[#1a1a2e] border-b border-gray-800 sticky top-[68px] z-10">
        <div className="flex">
          {(["details", "checklist", "photos", "customer"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-orange-400 border-b-2 border-orange-400"
                  : "text-gray-400"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {activeTab === "details" && (
          <div className="space-y-4">
            {/* Job Info Card */}
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Job Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Scheduled</span>
                  <span>{job.scheduled}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fireplace</span>
                  <span className="text-right">{job.fireplace}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Address</span>
                  <span className="text-right text-xs">{job.address}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-800">
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-blue-500/20 text-blue-400 py-2 rounded-lg text-sm font-medium"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Navigate to Location
                </a>
              </div>
            </div>

            {/* Notes Card */}
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <h3 className="font-semibold mb-2">Job Notes</h3>
              <p className="text-sm text-gray-300">{job.notes}</p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowEstimateModal(true)}
                className="bg-gradient-to-r from-orange-500 to-amber-500 py-3 rounded-xl text-sm font-medium"
              >
                Create Estimate
              </button>
              <button
                onClick={() => setShowNoteModal(true)}
                className="bg-[#252540] py-3 rounded-xl text-sm font-medium border border-gray-700"
              >
                Add Note
              </button>
            </div>
          </div>
        )}

        {activeTab === "checklist" && (
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Progress</span>
                <span className="text-orange-400 font-medium">{progress}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Checklist Items */}
            <div className="space-y-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className={`bg-[#1a1a2e] rounded-xl p-4 border ${
                    checklistItems[item.id] ? "border-green-500/50" : "border-gray-800"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleCheckItem(item.id)}
                      className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        checklistItems[item.id]
                          ? "bg-green-500"
                          : "border-2 border-gray-600"
                      }`}
                    >
                      {checklistItems[item.id] && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1">
                      <p className={`text-sm ${checklistItems[item.id] ? "line-through text-gray-500" : ""}`}>
                        {item.task}
                      </p>
                      {item.photo && (
                        <button
                          onClick={handlePhotoCapture}
                          className="mt-2 flex items-center gap-1 text-xs text-orange-400"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Photo Required
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Complete & Share Button */}
            {progress === 100 && (
              <button className="w-full bg-gradient-to-r from-green-500 to-emerald-500 py-4 rounded-xl font-semibold">
                Complete & Share Inspection
              </button>
            )}
          </div>
        )}

        {activeTab === "photos" && (
          <div className="space-y-4">
            {/* Capture Button */}
            <button
              onClick={handlePhotoCapture}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 py-4 rounded-xl font-semibold flex items-center justify-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Take Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
            />

            {/* Photo Gallery */}
            <div className="grid grid-cols-3 gap-2">
              {job.photos.map((photo) => (
                <div key={photo.id} className="aspect-square bg-[#1a1a2e] rounded-lg overflow-hidden relative">
                  <div className="absolute inset-0 flex items-center justify-center text-gray-600">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1">
                    <p className="text-xs truncate">{photo.caption}</p>
                  </div>
                </div>
              ))}
              {/* Empty slots */}
              {[...Array(6 - job.photos.length)].map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square bg-[#1a1a2e] rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "customer" && (
          <div className="space-y-4">
            {/* Customer Info */}
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Customer Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Phone</span>
                  <a href={`tel:${job.phone}`} className="text-orange-400">{job.phone}</a>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Email</span>
                  <a href={`mailto:${job.email}`} className="text-orange-400">{job.email}</a>
                </div>
              </div>
            </div>

            {/* History */}
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Service History</h3>
              <div className="space-y-3">
                {job.customerNotes.map((note, i) => (
                  <div key={i} className="border-l-2 border-orange-500 pl-3">
                    <p className="text-xs text-gray-400">{note.date}</p>
                    <p className="text-sm">{note.note}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Estimates */}
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Estimates</h3>
              {job.estimates.length > 0 ? (
                <div className="space-y-2">
                  {job.estimates.map((est) => (
                    <div key={est.id} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                      <div>
                        <p className="text-sm">{est.id}</p>
                        <p className="text-xs text-gray-400">{est.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${est.amount}</p>
                        <p className="text-xs text-green-400 capitalize">{est.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No estimates</p>
              )}
            </div>

            {/* Invoices */}
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Invoices</h3>
              {job.invoices.length > 0 ? (
                <div className="space-y-2">
                  {job.invoices.map((inv) => (
                    <div key={inv.id} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                      <div>
                        <p className="text-sm">{inv.id}</p>
                        <p className="text-xs text-gray-400">{inv.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${inv.amount}</p>
                        <p className="text-xs text-green-400 capitalize">{inv.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No invoices</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Estimate Modal */}
      {showEstimateModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
          <div className="bg-[#1a1a2e] w-full max-w-md mx-auto rounded-t-2xl p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Create Estimate</h3>
              <button onClick={() => setShowEstimateModal(false)} className="text-gray-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <Link
              href="/tech/estimate"
              className="block w-full bg-gradient-to-r from-orange-500 to-amber-500 py-3 rounded-xl text-center font-medium mb-3"
            >
              Use AI Estimate Builder
            </Link>
            <button className="w-full bg-[#252540] py-3 rounded-xl font-medium border border-gray-700">
              Manual Entry
            </button>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
          <div className="bg-[#1a1a2e] w-full max-w-md mx-auto rounded-t-2xl p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add Note</h3>
              <button onClick={() => setShowNoteModal(false)} className="text-gray-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Enter your note..."
              className="w-full bg-[#252540] rounded-xl p-3 text-sm min-h-[100px] border border-gray-700 focus:border-orange-500 outline-none"
            />
            <button
              onClick={() => {
                // Save note logic
                setShowNoteModal(false);
                setNewNote("");
              }}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 py-3 rounded-xl font-medium mt-3"
            >
              Save Note
            </button>
          </div>
        </div>
      )}

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
          <Link href="/tech/profile" className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
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
