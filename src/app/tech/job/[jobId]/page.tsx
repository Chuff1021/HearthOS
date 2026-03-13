"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TechBottomNav from "@/components/tech/TechBottomNav";

const emptyJobData = {
  id: "",
  customer: "",
  address: "",
  phone: "",
  email: "",
  fireplace: "",
  fireplaceModel: "",
  fireplaceType: "",
  type: "Service",
  scheduled: "",
  notes: "",
  customerNotes: [],
  estimates: [],
  invoices: [],
  photos: [],
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

// Material catalog with unit prices
const materialCatalog = [
  { id: "flex-pipe-6", name: "Flex Gas Pipe", unit: "ft", unitPrice: 4.50, category: "pipe" },
  { id: "rigid-pipe-4", name: "4\" Rigid Vent Pipe", unit: "ft", unitPrice: 8.75, category: "pipe" },
  { id: "rigid-pipe-6", name: "6\" Rigid Vent Pipe", unit: "ft", unitPrice: 11.25, category: "pipe" },
  { id: "flex-liner", name: "Flex Liner (SS)", unit: "ft", unitPrice: 14.00, category: "pipe" },
  { id: "elbow-90", name: "90° Elbow", unit: "ea", unitPrice: 22.00, category: "fitting" },
  { id: "elbow-45", name: "45° Elbow", unit: "ea", unitPrice: 18.50, category: "fitting" },
  { id: "tee-cap", name: "Tee Cap", unit: "ea", unitPrice: 15.00, category: "fitting" },
  { id: "termination-cap", name: "Termination Cap", unit: "ea", unitPrice: 45.00, category: "fitting" },
  { id: "thermocouple", name: "Thermocouple (Universal)", unit: "ea", unitPrice: 28.00, category: "part" },
  { id: "thermopile", name: "Thermopile", unit: "ea", unitPrice: 42.00, category: "part" },
  { id: "igniter", name: "Spark Igniter", unit: "ea", unitPrice: 35.00, category: "part" },
  { id: "gas-valve", name: "Gas Valve", unit: "ea", unitPrice: 125.00, category: "part" },
  { id: "blower-kit", name: "Blower Kit", unit: "ea", unitPrice: 89.00, category: "part" },
  { id: "remote-kit", name: "Remote Control Kit", unit: "ea", unitPrice: 65.00, category: "part" },
  { id: "glass-panel", name: "Replacement Glass Panel", unit: "ea", unitPrice: 145.00, category: "part" },
  { id: "gasket-tape", name: "Gasket Tape (per roll)", unit: "ea", unitPrice: 12.00, category: "supply" },
  { id: "pipe-sealant", name: "Gas Pipe Sealant", unit: "ea", unitPrice: 8.00, category: "supply" },
  { id: "wire-connector", name: "Wire Connectors (bag)", unit: "ea", unitPrice: 5.00, category: "supply" },
];

interface MaterialUsed {
  id: string;
  materialId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [activeTab, setActiveTab] = useState<"details" | "checklist" | "photos" | "customer">("details");
  const [checklistItems, setChecklistItems] = useState<Record<number, boolean>>({});
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [materialsUsed, setMaterialsUsed] = useState<MaterialUsed[]>([]);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [loadingJob, setLoadingJob] = useState(true);
  const [job, setJob] = useState<any>(emptyJobData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const materialCounter = useRef(1000);

  const checklist = job.type === "Annual Inspection" ? inspectionChecklist : installationChecklist;

  useEffect(() => {
    async function loadJob() {
      setLoadingJob(true);
      try {
        const res = await fetch(`/api/jobs?id=${jobId}`);
        const data = await res.json();
        const found = data.jobs?.[0];
        if (found) {
          setJob((prev: any) => ({
            ...prev,
            id: found.id,
            customer: found.customerName || prev.customer,
            address: found.propertyAddress || prev.address,
            type: found.title || prev.type,
            scheduled: `${found.scheduledDate} ${found.scheduledTimeStart}`,
            notes: found.notes || prev.notes,
            photos: prev.photos || [],
          }));
        }
      } finally {
        setLoadingJob(false);
      }
    }
    if (jobId) loadJob();
  }, [jobId]);

  const handleCheckItem = (id: number) => {
    setChecklistItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(checklistItems).filter(Boolean).length;
  const progress = Math.round((completedCount / checklist.length) * 100);

  const handlePhotoCapture = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const photo = {
        id: `photo-${Date.now()}`,
        type: "progress",
        label: file.name,
        timestamp: new Date().toISOString(),
        uri: String(reader.result),
      };
      const nextPhotos = [...(job.photos || []), photo];
      setJob((prev: any) => ({ ...prev, photos: nextPhotos }));
      setActionMsg("Photo saved to job record.");
      await fetch('/api/jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: jobId, photos: nextPhotos }),
      });
    };
    reader.readAsDataURL(file);
  };

  const filteredMaterials = materialCatalog.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(materialSearch.toLowerCase());
    const matchesCategory = selectedCategory === "all" || m.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addMaterial = (material: typeof materialCatalog[0]) => {
    const existing = materialsUsed.find((m) => m.materialId === material.id);
    if (existing) {
      setMaterialsUsed((prev) =>
        prev.map((m) =>
          m.materialId === material.id
            ? { ...m, quantity: m.quantity + 1, total: (m.quantity + 1) * m.unitPrice }
            : m
        )
      );
    } else {
      materialCounter.current += 1;
      const newMaterial: MaterialUsed = {
        id: materialCounter.current.toString(),
        materialId: material.id,
        name: material.name,
        unit: material.unit,
        quantity: 1,
        unitPrice: material.unitPrice,
        total: material.unitPrice,
      };
      setMaterialsUsed((prev) => [...prev, newMaterial]);
    }
    setShowMaterialPicker(false);
    setMaterialSearch("");
  };

  const updateMaterialQty = (id: string, qty: number) => {
    if (qty <= 0) {
      setMaterialsUsed((prev) => prev.filter((m) => m.id !== id));
    } else {
      setMaterialsUsed((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, quantity: qty, total: qty * m.unitPrice } : m
        )
      );
    }
  };

  const materialsTotal = materialsUsed.reduce((sum, m) => sum + m.total, 0);
  const laborRate = 89; // base labor
  const invoiceTotal = materialsTotal + laborRate;

  const handleSaveInvoiceDraft = () => {
    const draft = { jobId, customer: job.customer, date: new Date().toISOString(), materialsUsed, laborRate, total: invoiceTotal };
    localStorage.setItem(`tech-invoice-draft-${jobId}`, JSON.stringify(draft));
    setActionMsg("Invoice draft saved.");
  };

  const handleSendInvoice = async () => {
    try {
      const payload = {
        customerName: job.customer,
        customerId: "",
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        lineItems: [
          { description: 'Labor', qty: 1, unitPrice: laborRate },
          ...materialsUsed.map((m) => ({ description: m.name, qty: m.quantity, unitPrice: m.unitPrice })),
        ],
        notes: `Generated from tech job ${jobId}`,
      };
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setActionMsg("Invoice created and sent to office.");
      setShowInvoicePreview(false);
    } catch {
      const queue = { jobId, customer: job.customer, amount: invoiceTotal * 1.07, sentAt: new Date().toISOString() };
      localStorage.setItem(`tech-invoice-send-${jobId}`, JSON.stringify(queue));
      setActionMsg("Invoice queued (offline fallback).");
      setShowInvoicePreview(false);
    }
  };

  const handleCompleteInspection = async () => {
    await fetch('/api/jobs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: jobId, status: 'completed' }),
    });
    setActionMsg("Inspection completed and shared with office.");
  };

  const categoryColors: Record<string, string> = {
    pipe: "bg-blue-500/20 text-blue-400",
    fitting: "bg-purple-500/20 text-purple-400",
    part: "bg-blue-600/20 text-blue-600",
    supply: "bg-green-500/20 text-green-400",
  };

  return (
    <div className="flex flex-col min-h-screen pb-32">
      {/* Header */}
      <header
        className="bg-[var(--color-surface-1)] sticky top-0 z-10 px-4 pb-4"
        style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
      >
        <div className="flex items-center gap-3">
          <Link href="/tech" aria-label="Back to Jobs" className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{job.customer}</h1>
            <p className="text-xs text-gray-400">{job.type} · {job.fireplace}</p>
          </div>
          <a href={`tel:${job.phone}`} className="bg-green-500 p-2 rounded-full">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </a>
        </div>
      </header>

      {loadingJob && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
          Loading job details...
        </div>
      )}

      {actionMsg && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(152,205,0,0.12)", border: "1px solid rgba(152,205,0,0.35)", color: "#98CD00" }}>
          {actionMsg}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-[var(--color-surface-1)] border-b border-gray-800 sticky z-10" style={{ top: "calc(env(safe-area-inset-top) + 86px)" }}>
        <div className="flex">
          {(["details", "checklist", "photos", "customer"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-blue-600 border-b-2 border-orange-400"
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
            <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
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
            <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
              <h3 className="font-semibold mb-2">Job Notes</h3>
              <p className="text-sm text-gray-300">{job.notes}</p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowEstimateModal(true)}
                className="bg-gradient-to-r from-blue-600 to-blue-700 py-3 rounded-xl text-sm font-medium"
              >
                Create Estimate
              </button>
              <button
                onClick={() => setShowNoteModal(true)}
                className="bg-[var(--color-surface-3)] py-3 rounded-xl text-sm font-medium border border-gray-700"
              >
                Add Note
              </button>
            </div>
          </div>
        )}

        {activeTab === "checklist" && (
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Checklist Progress</span>
                <span className="text-blue-600 font-medium">{completedCount}/{checklist.length} · {progress}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-700 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Checklist Items */}
            <div className="space-y-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className={`bg-[var(--color-surface-1)] rounded-xl p-4 border ${
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
                          className="mt-2 flex items-center gap-1 text-xs text-blue-600"
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

            {/* ─── Materials Used Section ─── */}
            <div className="bg-[var(--color-surface-1)] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold">Materials Used</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Pipe, parts &amp; supplies — auto-added to invoice</p>
                </div>
                <button
                  onClick={() => setShowMaterialPicker(true)}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>

              {materialsUsed.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <svg className="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <p className="text-sm">No materials logged yet</p>
                  <p className="text-xs mt-1">Tap Add to log pipe, parts &amp; supplies</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {materialsUsed.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{m.name}</p>
                        <p className="text-xs text-gray-400">${m.unitPrice.toFixed(2)} / {m.unit}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateMaterialQty(m.id, m.quantity - 1)}
                          className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center text-sm"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-medium">{m.quantity}</span>
                        <button
                          onClick={() => updateMaterialQty(m.id, m.quantity + 1)}
                          className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center text-sm"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-right w-16">
                        <p className="text-sm font-semibold text-blue-600">${m.total.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}

                  {/* Materials subtotal */}
                  <div className="pt-3 mt-1 border-t border-gray-700 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Materials</span>
                      <span>${materialsTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Labor (base)</span>
                      <span>${laborRate.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-base pt-1.5 border-t border-gray-700">
                      <span>Invoice Total</span>
                      <span className="text-blue-600">${invoiceTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowInvoicePreview(true)}
                    className="w-full mt-3 bg-gradient-to-r from-green-500 to-emerald-500 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Preview &amp; Send Invoice
                  </button>
                </div>
              )}
            </div>

            {/* Complete & Share Button */}
            {progress === 100 && (
              <button onClick={handleCompleteInspection} className="w-full bg-gradient-to-r from-green-500 to-emerald-500 py-4 rounded-xl font-semibold">
                Complete &amp; Share Inspection
              </button>
            )}
          </div>
        )}

        {activeTab === "photos" && (
          <div className="space-y-4">
            {/* Capture Button */}
            <button
              onClick={handlePhotoCapture}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 py-4 rounded-xl font-semibold flex items-center justify-center gap-2"
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
              onChange={handlePhotoSelected}
              className="hidden"
            />

            {/* Photo Gallery */}
            <div className="grid grid-cols-3 gap-2">
              {(job.photos || []).map((photo: any) => (
                <div key={photo.id} className="aspect-square bg-[var(--color-surface-1)] rounded-lg overflow-hidden relative">
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
              {[...Array(Math.max(0, 6 - job.photos.length))].map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square bg-[var(--color-surface-1)] rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center">
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
            <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Customer Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Phone</span>
                  <a href={`tel:${job.phone}`} className="text-blue-600">{job.phone}</a>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Email</span>
                  <a href={`mailto:${job.email}`} className="text-blue-600">{job.email}</a>
                </div>
              </div>
            </div>

            {/* History */}
            <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Service History</h3>
              <div className="space-y-3">
                {(job.customerNotes || []).map((note: any, i: number) => (
                  <div key={i} className="border-l-2 border-blue-600 pl-3">
                    <p className="text-xs text-gray-400">{note.date}</p>
                    <p className="text-sm">{note.note}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Estimates */}
            <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Estimates</h3>
              {job.estimates.length > 0 ? (
                <div className="space-y-2">
                  {(job.estimates || []).map((est: any) => (
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
            <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Invoices</h3>
              {job.invoices.length > 0 ? (
                <div className="space-y-2">
                  {(job.invoices || []).map((inv: any) => (
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

      {/* ─── Material Picker Modal ─── */}
      {showMaterialPicker && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="bg-[var(--color-surface-1)] flex-1 flex flex-col max-h-[90vh] mt-auto rounded-t-2xl">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold">Add Material</h3>
              <button onClick={() => { setShowMaterialPicker(false); setMaterialSearch(""); }} className="text-gray-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="p-4 pb-2">
              <input
                type="text"
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
                placeholder="Search materials..."
                className="w-full bg-[var(--color-surface-3)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
                autoFocus
              />
            </div>

            {/* Category Filter */}
            <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
              {["all", "pipe", "fitting", "part", "supply"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? "bg-blue-600 text-white"
                      : "bg-[var(--color-surface-3)] text-gray-400 border border-gray-700"
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            {/* Material List */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
              {filteredMaterials.map((material) => (
                <button
                  key={material.id}
                  onClick={() => addMaterial(material)}
                  className="w-full flex items-center justify-between bg-[var(--color-surface-3)] rounded-xl p-3 border border-gray-700 hover:border-blue-600 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium">{material.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[material.category]}`}>
                        {material.category}
                      </span>
                      <span className="text-xs text-gray-400">per {material.unit}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-blue-600">${material.unitPrice.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">/{material.unit}</p>
                  </div>
                </button>
              ))}
              {filteredMaterials.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">No materials found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Invoice Preview Modal ─── */}
      {showInvoicePreview && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="bg-[var(--color-surface-1)] flex-1 flex flex-col max-h-[90vh] mt-auto rounded-t-2xl">
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold">Invoice Preview</h3>
              <button onClick={() => setShowInvoicePreview(false)} className="text-gray-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Invoice Header */}
              <div className="bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-blue-600/30 rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-gray-400">Invoice for</p>
                    <p className="font-semibold">{job.customer}</p>
                    <p className="text-xs text-gray-400 mt-1">{job.address}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Date</p>
                    <p className="text-sm font-medium">{new Date().toLocaleDateString()}</p>
                    <p className="text-xs text-blue-600 mt-1">DRAFT</p>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="bg-[var(--color-surface-3)] rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-sm pb-2 border-b border-gray-700">
                  <span className="text-gray-400 font-medium">Description</span>
                  <span className="text-gray-400 font-medium">Amount</span>
                </div>
                {/* Labor */}
                <div className="flex justify-between text-sm">
                  <div>
                    <p className="font-medium">{job.type} — Labor</p>
                    <p className="text-xs text-gray-400">{job.fireplace}</p>
                  </div>
                  <span>${laborRate.toFixed(2)}</span>
                </div>
                {/* Materials */}
                {materialsUsed.map((m) => (
                  <div key={m.id} className="flex justify-between text-sm">
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-gray-400">{m.quantity} {m.unit} × ${m.unitPrice.toFixed(2)}</p>
                    </div>
                    <span>${m.total.toFixed(2)}</span>
                  </div>
                ))}
                {/* Total */}
                <div className="pt-3 border-t border-gray-700 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Subtotal</span>
                    <span>${invoiceTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Tax (7%)</span>
                    <span>${(invoiceTotal * 0.07).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-700">
                    <span>Total Due</span>
                    <span className="text-blue-600">${(invoiceTotal * 1.07).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 space-y-3 border-t border-gray-800">
              <button onClick={handleSendInvoice} className="w-full bg-gradient-to-r from-green-500 to-emerald-500 py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Send to Customer
              </button>
              <button onClick={handleSaveInvoiceDraft} className="w-full bg-[var(--color-surface-3)] py-3 rounded-xl font-medium border border-gray-700">
                Save as Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estimate Modal */}
      {showEstimateModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
          <div className="bg-[var(--color-surface-1)] w-full max-w-md mx-auto rounded-t-2xl p-4">
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
              className="block w-full bg-gradient-to-r from-blue-600 to-blue-700 py-3 rounded-xl text-center font-medium mb-3"
            >
              Use AI Estimate Builder
            </Link>
            <button onClick={() => { setShowEstimateModal(false); setActionMsg('Manual estimate entry opened in office workflow.'); }} className="w-full bg-[var(--color-surface-3)] py-3 rounded-xl font-medium border border-gray-700">
              Manual Entry
            </button>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
          <div className="bg-[var(--color-surface-1)] w-full max-w-md mx-auto rounded-t-2xl p-4">
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
              className="w-full bg-[var(--color-surface-3)] rounded-xl p-3 text-sm min-h-[100px] border border-gray-700 focus:border-blue-600 outline-none"
            />
            <button
              onClick={async () => {
                const mergedNote = [job.notes, newNote].filter(Boolean).join("\n");
                setJob((prev: any) => ({ ...prev, notes: mergedNote }));
                await fetch('/api/jobs', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: jobId, notes: mergedNote }),
                });
                setActionMsg('Note saved to job.');
                setShowNoteModal(false);
                setNewNote("");
              }}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 py-3 rounded-xl font-medium mt-3"
            >
              Save Note
            </button>
          </div>
        </div>
      )}

      <TechBottomNav active="jobs" />
    </div>
  );
}
