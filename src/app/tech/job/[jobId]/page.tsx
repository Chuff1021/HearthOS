"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TechBottomNav from "@/components/tech/TechBottomNav";
import { arrayToMultiselectValue, buildInitialChecklistForm, checklistCompletion, getChecklistTemplate, inferChecklistTemplateId, multiselectValueToArray, type ChecklistForm } from "@/lib/job-checklists";

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
  checklistItems: {},
  checklistForm: undefined,
};

// Material catalog with unit prices
type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  unitPrice: number;
  category: string;
  qtyOnHand?: number;
  sku?: string;
  source: "quickbooks" | "local";
};

const localMaterialCatalog: CatalogItem[] = [
  { id: "flex-pipe-6", name: "Flex Gas Pipe", unit: "ft", unitPrice: 4.50, category: "pipe", source: "local" },
  { id: "rigid-pipe-4", name: "4\" Rigid Vent Pipe", unit: "ft", unitPrice: 8.75, category: "pipe", source: "local" },
  { id: "rigid-pipe-6", name: "6\" Rigid Vent Pipe", unit: "ft", unitPrice: 11.25, category: "pipe", source: "local" },
  { id: "flex-liner", name: "Flex Liner (SS)", unit: "ft", unitPrice: 14.00, category: "pipe", source: "local" },
  { id: "elbow-90", name: "90° Elbow", unit: "ea", unitPrice: 22.00, category: "fitting", source: "local" },
  { id: "elbow-45", name: "45° Elbow", unit: "ea", unitPrice: 18.50, category: "fitting", source: "local" },
  { id: "tee-cap", name: "Tee Cap", unit: "ea", unitPrice: 15.00, category: "fitting", source: "local" },
  { id: "termination-cap", name: "Termination Cap", unit: "ea", unitPrice: 45.00, category: "fitting", source: "local" },
  { id: "thermocouple", name: "Thermocouple (Universal)", unit: "ea", unitPrice: 28.00, category: "part", source: "local" },
  { id: "thermopile", name: "Thermopile", unit: "ea", unitPrice: 42.00, category: "part", source: "local" },
  { id: "igniter", name: "Spark Igniter", unit: "ea", unitPrice: 35.00, category: "part", source: "local" },
  { id: "gas-valve", name: "Gas Valve", unit: "ea", unitPrice: 125.00, category: "part", source: "local" },
  { id: "blower-kit", name: "Blower Kit", unit: "ea", unitPrice: 89.00, category: "part", source: "local" },
  { id: "remote-kit", name: "Remote Control Kit", unit: "ea", unitPrice: 65.00, category: "part", source: "local" },
  { id: "glass-panel", name: "Replacement Glass Panel", unit: "ea", unitPrice: 145.00, category: "part", source: "local" },
  { id: "gasket-tape", name: "Gasket Tape (per roll)", unit: "ea", unitPrice: 12.00, category: "supply", source: "local" },
  { id: "pipe-sealant", name: "Gas Pipe Sealant", unit: "ea", unitPrice: 8.00, category: "supply", source: "local" },
  { id: "wire-connector", name: "Wire Connectors (bag)", unit: "ea", unitPrice: 5.00, category: "supply", source: "local" },
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

type ChecklistPhotoTarget = {
  id: string;
  task: string;
};

async function compressImage(file: File, maxDimension = 1600, quality = 0.8): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Failed to load image"));
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });

  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [activeTab, setActiveTab] = useState<"details" | "checklist" | "photos" | "customer">("details");
  const [customerInfo, setCustomerInfo] = useState<{ phone?: string; email?: string; address?: string; name?: string } | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [checklistItems, setChecklistItems] = useState<Record<string, boolean>>({});
  const [checklistForm, setChecklistForm] = useState<ChecklistForm | null>(null);
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [materialsUsed, setMaterialsUsed] = useState<MaterialUsed[]>([]);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [qbItems, setQbItems] = useState<CatalogItem[]>([]);
  const [qbItemsLoaded, setQbItemsLoaded] = useState(false);
  const [qbItemsLoading, setQbItemsLoading] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [loadingJob, setLoadingJob] = useState(true);
  const [job, setJob] = useState<any>(emptyJobData);
  const [pendingChecklistPhoto, setPendingChecklistPhoto] = useState<ChecklistPhotoTarget | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const materialCounter = useRef(1000);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingSignatureRef = useRef(false);

  const checklistTemplateId = useMemo(
    () => checklistForm?.templateId || inferChecklistTemplateId({ jobType: job.type, fireplaceType: job.fireplaceType, title: job.type }),
    [checklistForm?.templateId, job.fireplaceType, job.type]
  );
  const checklistTemplate = useMemo(() => getChecklistTemplate(checklistTemplateId), [checklistTemplateId]);

  useEffect(() => {
    async function loadJob() {
      setLoadingJob(true);
      try {
        const res = await fetch(`/api/jobs?id=${jobId}`);
        const data = await res.json();
        const found = data.jobs?.[0];
        if (found) {
          const inferredTemplateId = inferChecklistTemplateId({
            jobType: found.jobType || found.title,
            fireplaceType: found.fireplaceUnit?.type,
            title: found.title,
          });
          const initialForm = found.checklistForm || buildInitialChecklistForm(inferredTemplateId);
          setJob((prev: any) => ({
            ...prev,
            id: found.id,
            customer: found.customerName || prev.customer,
            address: found.propertyAddress || prev.address,
            type: found.title || prev.type,
            fireplace: found.fireplaceUnit?.nickname || found.fireplaceUnit?.brand || prev.fireplace,
            fireplaceModel: found.fireplaceUnit?.model || prev.fireplaceModel,
            fireplaceType: found.fireplaceUnit?.type || prev.fireplaceType,
            scheduled: `${found.scheduledDate} ${found.scheduledTimeStart}`,
            notes: found.notes || prev.notes,
            photos: found.photos || prev.photos || [],
            checklistItems: found.checklistItems || {},
            checklistForm: initialForm,
          }));
          setChecklistItems(found.checklistItems || {});
          setChecklistForm(initialForm);
        }
      } finally {
        setLoadingJob(false);
      }
    }
    if (jobId) loadJob();
  }, [jobId]);

  useEffect(() => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!checklistForm?.customerSignature) return;
    const image = new Image();
    image.onload = () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = checklistForm.customerSignature;
  }, [checklistForm?.customerSignature]);

  async function persistJobUpdates(updates: Record<string, unknown>) {
    const res = await fetch('/api/jobs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: jobId, ...updates }),
    });
    if (!res.ok) {
      throw new Error('Failed to save job');
    }
    const data = await res.json();
    if (data.job) {
      setJob((prev: any) => ({ ...prev, ...data.job }));
      if (data.job.checklistItems) {
        setChecklistItems(data.job.checklistItems);
      }
      if (data.job.checklistForm) {
        setChecklistForm(data.job.checklistForm);
      }
    }
    return data.job;
  }

  const handleCheckItem = async (id: string) => {
    const nextChecklistItems = { ...checklistItems, [id]: !checklistItems[id] };
    setChecklistItems(nextChecklistItems);
    setJob((prev: any) => ({ ...prev, checklistItems: nextChecklistItems }));
    try {
      await persistJobUpdates({ checklistItems: nextChecklistItems });
    } catch {
      setActionMsg("Checklist save failed. Try again.");
    }
  };

  const updateChecklistForm = async (fieldId: string, value: string | boolean) => {
    const nextForm: ChecklistForm = {
      ...(checklistForm || buildInitialChecklistForm(checklistTemplateId)),
      templateId: checklistTemplateId,
      values: {
        ...(checklistForm?.values || {}),
        [fieldId]: value,
      },
      updatedAt: new Date().toISOString(),
    };
    setChecklistForm(nextForm);
    setJob((prev: any) => ({ ...prev, checklistForm: nextForm }));
    try {
      await persistJobUpdates({ checklistForm: nextForm });
    } catch {
      setActionMsg("Checklist form save failed. Try again.");
    }
  };

  const updateChecklistMeta = async (patch: Partial<ChecklistForm>) => {
    const nextForm: ChecklistForm = {
      ...(checklistForm || buildInitialChecklistForm(checklistTemplateId)),
      ...patch,
      templateId: checklistTemplateId,
      values: {
        ...(checklistForm?.values || {}),
        ...(patch.values || {}),
      },
      updatedAt: new Date().toISOString(),
    };
    setChecklistForm(nextForm);
    setJob((prev: any) => ({ ...prev, checklistForm: nextForm }));
    try {
      await persistJobUpdates({ checklistForm: nextForm });
    } catch {
      setActionMsg("Checklist save failed. Try again.");
    }
  };

  const completion = checklistCompletion(checklistForm);
  const completedCount = completion.completed;
  const progress = completion.percent;

  const handlePhotoCapture = () => {
    setPendingChecklistPhoto(null);
    fileInputRef.current?.click();
  };

  const handlePhotoFromGallery = () => {
    setPendingChecklistPhoto(null);
    galleryInputRef.current?.click();
  };

  const handleChecklistPhotoCapture = (item: ChecklistPhotoTarget) => {
    setPendingChecklistPhoto(item);
    fileInputRef.current?.click();
  };

  const drawSignaturePoint = (clientX: number, clientY: number) => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (!isDrawingSignatureRef.current) {
      context.beginPath();
      context.moveTo(x, y);
      isDrawingSignatureRef.current = true;
      return;
    }
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#111827";
    context.lineTo(x, y);
    context.stroke();
  };

  const startSignature = (clientX: number, clientY: number) => {
    isDrawingSignatureRef.current = false;
    drawSignaturePoint(clientX, clientY);
  };

  const endSignature = () => {
    isDrawingSignatureRef.current = false;
  };

  const saveSignature = async () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const signature = canvas.toDataURL("image/png");
    await updateChecklistMeta({
      customerSignature: signature,
      signedAt: new Date().toISOString(),
    });
    setActionMsg("Customer signature saved.");
  };

  const clearSignature = async () => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    await updateChecklistMeta({
      customerSignature: "",
      signedAt: undefined,
    });
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    try {
      const latestRes = await fetch(`/api/jobs?id=${jobId}`, { cache: "no-store" });
      const latestData = await latestRes.json();
      const latestJob = latestData.jobs?.[0];
      const existingPhotos = Array.isArray(latestJob?.photos) ? latestJob.photos : (job.photos || []);

      const newPhotos: any[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressedUri = await compressImage(file);
        newPhotos.push({
          id: `photo-${Date.now()}-${i}`,
          type: pendingChecklistPhoto ? "checklist" : "progress",
          label: pendingChecklistPhoto ? `${pendingChecklistPhoto.task}` : file.name,
          caption: pendingChecklistPhoto ? `${pendingChecklistPhoto.task}` : file.name,
          timestamp: new Date().toISOString(),
          uri: compressedUri,
          checklistItemId: pendingChecklistPhoto ? String(pendingChecklistPhoto.id) : undefined,
        });
      }

      const nextPhotos = [...existingPhotos, ...newPhotos].filter((entry, index, arr) => {
        const signature = `${entry.uri || ""}:${entry.timestamp || ""}:${entry.label || entry.caption || ""}:${entry.checklistItemId || ""}`;
        return arr.findIndex((candidate) => `${candidate.uri || ""}:${candidate.timestamp || ""}:${candidate.label || candidate.caption || ""}:${candidate.checklistItemId || ""}` === signature) === index;
      });
      setJob((prev: any) => ({ ...prev, photos: nextPhotos }));
      await persistJobUpdates({ photos: nextPhotos });
      const count = newPhotos.length;
      setActionMsg(pendingChecklistPhoto ? `Photo saved for checklist item: ${pendingChecklistPhoto.task}` : `${count} photo${count > 1 ? "s" : ""} saved to this job.`);
    } catch {
      setActionMsg("Photo save failed. Try again.");
    } finally {
      setPendingChecklistPhoto(null);
      event.target.value = "";
    }
  };

  // Fetch QuickBooks inventory when picker opens
  useEffect(() => {
    if (!showMaterialPicker || qbItemsLoaded) return;
    let cancelled = false;
    setQbItemsLoading(true);

    async function fetchQbItems() {
      try {
        const res = await fetch("/api/quickbooks/items?type=inventory", { cache: "no-store" });
        if (!res.ok) throw new Error("QB fetch failed");
        const data = await res.json();
        if (cancelled) return;
        const items: CatalogItem[] = (data.items || [])
          .filter((item: any) => item.Active !== false)
          .map((item: any) => ({
            id: `qb-${item.Id}`,
            name: item.Name || "Unknown Item",
            unit: "ea",
            unitPrice: Number(item.UnitPrice) || 0,
            category: "inventory",
            qtyOnHand: item.QtyOnHand ?? undefined,
            sku: item.Sku || undefined,
            source: "quickbooks" as const,
          }));
        setQbItems(items);
        setQbItemsLoaded(true);
      } catch {
        // QB not connected or failed — just use local catalog
        setQbItemsLoaded(true);
      } finally {
        if (!cancelled) setQbItemsLoading(false);
      }
    }

    fetchQbItems();
    return () => { cancelled = true; };
  }, [showMaterialPicker, qbItemsLoaded]);

  // Merge QB items with local catalog — QB items first
  const materialCatalog: CatalogItem[] = useMemo(() => {
    return [...qbItems, ...localMaterialCatalog];
  }, [qbItems]);

  // Derive available categories from the merged catalog
  const availableCategories = useMemo(() => {
    const cats = new Set(materialCatalog.map((m) => m.category));
    return ["all", ...Array.from(cats).sort()];
  }, [materialCatalog]);

  const filteredMaterials = materialCatalog.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(materialSearch.toLowerCase()) ||
      (m.sku && m.sku.toLowerCase().includes(materialSearch.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || m.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addMaterial = (material: CatalogItem) => {
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
  // Fetch customer info when customer tab is opened
  useEffect(() => {
    if (activeTab !== "customer" || customerInfo || loadingCustomer) return;
    const customerName = job.customer || job.customerName || "";
    if (!customerName || customerName.length < 2) return;
    setLoadingCustomer(true);
    (async () => {
      try {
        const res = await fetch(`/api/customer-lookup?q=${encodeURIComponent(customerName)}`);
        const data = await res.json();
        const match = (data.customers || []).find((c: any) =>
          (c.displayName || "").toLowerCase() === customerName.toLowerCase()
        ) || (data.customers || [])[0];
        if (match) {
          setCustomerInfo({
            name: match.displayName,
            phone: match.phone || "",
            email: match.email || "",
            address: match.address ? [match.address.line1, [match.address.city, match.address.state].filter(Boolean).join(", "), match.address.zip].filter(Boolean).join(" ") : "",
          });
        }
      } catch {}
      setLoadingCustomer(false);
    })();
  }, [activeTab, job.customer, job.customerName]); // eslint-disable-line react-hooks/exhaustive-deps

  const invoiceTotal = materialsTotal + laborRate;
  const activePhoto = lightboxIndex === null ? null : (job.photos || [])[lightboxIndex] || null;

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
    inventory: "bg-orange-500/20 text-orange-400",
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
            <div className="grid grid-cols-3 gap-3">
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
              <Link
                href={`/tech/payments?customer=${encodeURIComponent(job.customer || "")}&invoice=${encodeURIComponent(job.id || "")}`}
                className="bg-gradient-to-r from-orange-500 to-amber-500 py-3 rounded-xl text-sm font-medium text-center"
              >
                Take Payment
              </Link>
            </div>
          </div>
        )}

        {activeTab === "checklist" && (
          <div className="space-y-4">
            <div className="bg-[var(--color-surface-1)] rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{checklistTemplate.title}</div>
                  <div className="text-xs text-gray-400 mt-1">{checklistTemplate.subtitle}</div>
                </div>
                <button
                  onClick={() => window.open(`/tech/job/${jobId}/report?print=1`, "_blank", "noopener,noreferrer")}
                  className="px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ background: "rgba(37,99,235,0.14)", color: "#2563EB" }}
                >
                  Generate PDF
                </button>
              </div>
              <div className="flex justify-between text-sm mb-2 mt-4">
                <span className="text-gray-400">Required Fields</span>
                <span className="text-blue-600 font-medium">{completedCount}/{completion.total} · {progress}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-700 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="space-y-4">
              {checklistTemplate.sections.map((section) => (
                <div key={section.id} className="bg-[var(--color-surface-1)] rounded-xl p-4 border border-gray-800">
                  <div className="mb-3">
                    <h3 className="font-semibold">{section.title}</h3>
                    {section.description ? <p className="text-xs text-gray-400 mt-1">{section.description}</p> : null}
                  </div>
                  <div className="space-y-3">
                    {section.fields.map((field) => {
                      const fieldValue = checklistForm?.values?.[field.id];
                      const checklistPhotos = (job.photos || []).filter((photo: any) => String(photo.checklistItemId || "") === String(field.id));

                      if (field.type === "checkbox") {
                        return (
                          <div key={field.id} className={`rounded-xl p-3 border ${Boolean(fieldValue) ? "border-green-500/50" : "border-gray-800"}`}>
                            <div className="flex items-start gap-3">
                              <button
                                onClick={() => {
                                  void handleCheckItem(field.id);
                                  void updateChecklistForm(field.id, !Boolean(fieldValue));
                                }}
                                className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                  Boolean(fieldValue) ? "bg-green-500" : "border-2 border-gray-600"
                                }`}
                              >
                                {Boolean(fieldValue) ? (
                                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : null}
                              </button>
                              <div className="flex-1">
                                <p className={`text-sm ${Boolean(fieldValue) ? "line-through text-gray-500" : ""}`}>
                                  {field.label}
                                  {field.required ? <span className="text-orange-400 ml-1">*</span> : null}
                                </p>
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  <button
                                    onClick={() => handleChecklistPhotoCapture({ id: field.id, task: field.label })}
                                    className="flex items-center gap-1 text-xs text-blue-600"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    {checklistPhotos.length ? `Add Photo (${checklistPhotos.length})` : "Add Photo"}
                                  </button>
                                  {checklistPhotos.length > 0 ? <span className="text-xs text-green-500">{checklistPhotos.length} saved</span> : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (field.type === "textarea") {
                        return (
                          <div key={field.id} className="space-y-2">
                            <label className="text-sm font-medium">
                              {field.label}
                              {field.required ? <span className="text-orange-400 ml-1">*</span> : null}
                            </label>
                            <textarea
                              rows={4}
                              value={String(fieldValue || "")}
                              onChange={(event) => setChecklistForm((prev) => ({
                                ...(prev || buildInitialChecklistForm(checklistTemplateId)),
                                templateId: checklistTemplateId,
                                values: { ...(prev?.values || {}), [field.id]: event.target.value },
                              }))}
                              onBlur={(event) => void updateChecklistForm(field.id, event.target.value)}
                              placeholder={field.placeholder}
                              className="w-full rounded-xl px-3 py-3 text-sm"
                              style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                            />
                          </div>
                        );
                      }

                      // Pass/Fail toggle
                      if (field.type === "pass-fail") {
                        const val = String(fieldValue || "");
                        return (
                          <div key={field.id} className="rounded-xl p-3" style={{ border: `1px solid ${val === "pass" ? "rgba(22,163,74,0.5)" : val === "fail" ? "rgba(220,38,38,0.5)" : "var(--color-border)"}` }}>
                            <p className="text-sm mb-2">
                              {field.label}
                              {field.required ? <span className="text-orange-400 ml-1">*</span> : null}
                            </p>
                            <div className="flex gap-2">
                              {[["pass", "Pass", "#16A34A"], ["fail", "Fail", "#DC2626"], ["na", "N/A", "#9CA3AF"]].map(([v, lbl, color]) => (
                                <button key={v} onClick={() => void updateChecklistForm(field.id, v)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{
                                  background: val === v ? `${color}20` : "var(--color-surface-3)",
                                  color: val === v ? color : "var(--color-text-muted)",
                                  border: val === v ? `2px solid ${color}` : "1px solid var(--color-border)",
                                }}>{lbl}</button>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      // Measurement input with unit
                      if (field.type === "measurement") {
                        return (
                          <div key={field.id} className="space-y-1">
                            <label className="text-sm font-medium">
                              {field.label}
                              {field.required ? <span className="text-orange-400 ml-1">*</span> : null}
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text" inputMode="decimal"
                                value={String(fieldValue || "")}
                                onChange={(event) => setChecklistForm((prev) => ({
                                  ...(prev || buildInitialChecklistForm(checklistTemplateId)),
                                  templateId: checklistTemplateId,
                                  values: { ...(prev?.values || {}), [field.id]: event.target.value },
                                }))}
                                onBlur={(event) => void updateChecklistForm(field.id, event.target.value)}
                                placeholder={field.placeholder}
                                className="flex-1 rounded-xl px-3 py-3 text-sm"
                                style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                              />
                              {field.unit && <span className="text-xs font-medium px-2" style={{ color: "var(--color-text-muted)" }}>{field.unit}</span>}
                            </div>
                          </div>
                        );
                      }

                      // Select dropdown
                      if (field.type === "select") {
                        return (
                          <div key={field.id} className="space-y-1">
                            <label className="text-sm font-medium">
                              {field.label}
                              {field.required ? <span className="text-orange-400 ml-1">*</span> : null}
                            </label>
                            <select
                              value={String(fieldValue || "")}
                              onChange={(event) => void updateChecklistForm(field.id, event.target.value)}
                              className="w-full rounded-xl px-3 py-3 text-sm"
                              style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                            >
                              <option value="">Select...</option>
                              {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          </div>
                        );
                      }

                      // Rating selector (Good/Fair/Poor/Unsafe)
                      if (field.type === "rating") {
                        const val = String(fieldValue || "");
                        const ratings = [
                          { value: "good", label: "Good", color: "#16A34A" },
                          { value: "fair", label: "Fair", color: "#F59E0B" },
                          { value: "poor", label: "Poor", color: "#F97316" },
                          { value: "unsafe", label: "Unsafe", color: "#DC2626" },
                        ];
                        return (
                          <div key={field.id} className="space-y-2">
                            <label className="text-sm font-medium">
                              {field.label}
                              {field.required ? <span className="text-orange-400 ml-1">*</span> : null}
                            </label>
                            <div className="flex gap-2">
                              {ratings.map((r) => (
                                <button key={r.value} onClick={() => void updateChecklistForm(field.id, r.value)} className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors" style={{
                                  background: val === r.value ? `${r.color}20` : "var(--color-surface-3)",
                                  color: val === r.value ? r.color : "var(--color-text-muted)",
                                  border: val === r.value ? `2px solid ${r.color}` : "1px solid var(--color-border)",
                                }}>{r.label}</button>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      // Radio (single-choice button group — replaces awkward yes/no checkbox pairs)
                      if (field.type === "radio") {
                        const val = String(fieldValue || "");
                        return (
                          <div key={field.id} className="space-y-2">
                            <label className="text-sm font-medium">
                              {field.label}
                              {field.required ? <span className="text-orange-400 ml-1">*</span> : null}
                            </label>
                            {field.hint && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{field.hint}</p>}
                            <div className="flex flex-wrap gap-2">
                              {(field.options || []).map((opt) => (
                                <button
                                  key={opt}
                                  onClick={() => void updateChecklistForm(field.id, opt)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                                  style={{
                                    background: val === opt ? "rgba(248,151,31,0.18)" : "var(--color-surface-3)",
                                    color: val === opt ? "#9a5d12" : "var(--color-text-muted)",
                                    border: val === opt ? "2px solid #f8971f" : "1px solid var(--color-border)",
                                  }}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      // Multiselect (multi-pick button group — replaces multi-checkbox sets like termination styles)
                      if (field.type === "multiselect") {
                        const selected = multiselectValueToArray(fieldValue);
                        const toggle = (opt: string) => {
                          const next = selected.includes(opt)
                            ? selected.filter((s) => s !== opt)
                            : [...selected, opt];
                          void updateChecklistForm(field.id, arrayToMultiselectValue(next));
                        };
                        return (
                          <div key={field.id} className="space-y-2">
                            <label className="text-sm font-medium">
                              {field.label}
                              {field.required ? <span className="text-orange-400 ml-1">*</span> : null}
                              <span className="ml-1 text-xs" style={{ color: "var(--color-text-muted)" }}>(select all that apply)</span>
                            </label>
                            {field.hint && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{field.hint}</p>}
                            <div className="flex flex-wrap gap-2">
                              {(field.options || []).map((opt) => {
                                const on = selected.includes(opt);
                                return (
                                  <button
                                    key={opt}
                                    onClick={() => toggle(opt)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                                    style={{
                                      background: on ? "rgba(22,163,74,0.18)" : "var(--color-surface-3)",
                                      color: on ? "#16A34A" : "var(--color-text-muted)",
                                      border: on ? "2px solid #16A34A" : "1px solid var(--color-border)",
                                    }}
                                  >
                                    {on ? "✓ " : ""}{opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      // Default: text input
                      return (
                        <div key={field.id} className="space-y-2">
                          <label className="text-sm font-medium">
                            {field.label}
                            {field.required ? <span className="text-orange-400 ml-1">*</span> : null}
                          </label>
                          {field.hint && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{field.hint}</p>}
                          <input
                            type="text"
                            value={String(fieldValue || "")}
                            onChange={(event) => setChecklistForm((prev) => ({
                              ...(prev || buildInitialChecklistForm(checklistTemplateId)),
                              templateId: checklistTemplateId,
                              values: { ...(prev?.values || {}), [field.id]: event.target.value },
                            }))}
                            onBlur={(event) => void updateChecklistForm(field.id, event.target.value)}
                            placeholder={field.placeholder}
                            className="w-full rounded-xl px-3 py-3 text-sm"
                            style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[var(--color-surface-1)] rounded-xl p-4 border border-gray-800 space-y-3">
              <h3 className="font-semibold">Customer Sign-Off</h3>
              <input
                type="text"
                placeholder="Customer name"
                value={checklistForm?.customerName || ""}
                onChange={(event) => setChecklistForm((prev) => ({
                  ...(prev || buildInitialChecklistForm(checklistTemplateId)),
                  templateId: checklistTemplateId,
                  customerName: event.target.value,
                  values: { ...(prev?.values || {}) },
                }))}
                onBlur={(event) => void updateChecklistMeta({ customerName: event.target.value })}
                className="w-full rounded-xl px-3 py-3 text-sm"
                style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
              />
              <input
                type="text"
                placeholder="Technician name"
                value={checklistForm?.technicianName || ""}
                onChange={(event) => setChecklistForm((prev) => ({
                  ...(prev || buildInitialChecklistForm(checklistTemplateId)),
                  templateId: checklistTemplateId,
                  technicianName: event.target.value,
                  values: { ...(prev?.values || {}) },
                }))}
                onBlur={(event) => void updateChecklistMeta({ technicianName: event.target.value })}
                className="w-full rounded-xl px-3 py-3 text-sm"
                style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
              />
              <div className="rounded-xl border border-dashed border-gray-700 bg-white p-2">
                <canvas
                  ref={signatureCanvasRef}
                  width={800}
                  height={220}
                  className="w-full h-36 rounded-lg touch-none"
                  onPointerDown={(event) => startSignature(event.clientX, event.clientY)}
                  onPointerMove={(event) => {
                    if ((event.buttons & 1) !== 1) return;
                    drawSignaturePoint(event.clientX, event.clientY);
                  }}
                  onPointerUp={endSignature}
                  onPointerLeave={endSignature}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => void clearSignature()} className="flex-1 py-2 rounded-xl text-sm font-medium" style={{ background: "var(--color-surface-3)" }}>
                  Clear Signature
                </button>
                <button onClick={() => void saveSignature()} className="flex-1 py-2 rounded-xl text-sm font-medium text-white" style={{ background: "#2563EB" }}>
                  Save Signature
                </button>
              </div>
              {checklistForm?.signedAt ? <div className="text-xs text-gray-400">Signed {new Date(checklistForm.signedAt).toLocaleString()}</div> : null}
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
            {progress === 100 && checklistForm?.customerSignature && (
              <div className="space-y-2">
                <button
                  onClick={() => window.open(`/tech/job/${jobId}/report?print=1`, "_blank", "noopener,noreferrer")}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 py-4 rounded-xl font-semibold"
                >
                  Generate Customer PDF
                </button>
                <button onClick={handleCompleteInspection} className="w-full bg-gradient-to-r from-green-500 to-emerald-500 py-4 rounded-xl font-semibold">
                  Complete &amp; Share Inspection
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "photos" && (
          <div className="space-y-4">
            {/* Photo Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handlePhotoCapture}
                className="bg-gradient-to-r from-blue-600 to-blue-700 py-4 rounded-xl font-semibold flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Take Photo
              </button>
              <button
                onClick={handlePhotoFromGallery}
                className="py-4 rounded-xl font-semibold flex items-center justify-center gap-2"
                style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                From Photos
              </button>
            </div>
            {/* Camera input (opens camera) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelected}
              className="hidden"
            />
            {/* Gallery input (opens photo library) */}
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelected}
              multiple
              className="hidden"
            />

            {/* Photo Gallery */}
            <div className="grid grid-cols-3 gap-2">
              {(job.photos || []).map((photo: any, index: number) => (
                <button key={photo.id} onClick={() => setLightboxIndex(index)} className="aspect-square bg-[var(--color-surface-1)] rounded-lg overflow-hidden relative">
                  {photo.uri ? (
                    // Use the saved data URI directly so the uploaded field photo renders immediately.
                    <img src={photo.uri} alt={photo.label || photo.caption || "Job photo"} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-600">
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1">
                    <p className="text-xs truncate">{photo.label || photo.caption || "Job photo"}</p>
                  </div>
                </button>
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
              {loadingCustomer ? (
                <p className="text-sm text-gray-400">Loading customer info...</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Name</span>
                    <span className="font-medium">{customerInfo?.name || job.customer || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Phone</span>
                    {customerInfo?.phone ? (
                      <a href={`tel:${customerInfo.phone}`} className="flex items-center gap-2 font-medium" style={{ color: "#2563EB" }}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        {customerInfo.phone}
                      </a>
                    ) : (
                      <span className="text-gray-500">Not available</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Email</span>
                    {customerInfo?.email ? (
                      <a href={`mailto:${customerInfo.email}`} className="font-medium" style={{ color: "#2563EB" }}>{customerInfo.email}</a>
                    ) : (
                      <span className="text-gray-500">Not available</span>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-gray-400">Address</span>
                    <div className="text-right">
                      <span>{customerInfo?.address || job.propertyAddress || "—"}</span>
                      {(customerInfo?.address || job.propertyAddress) && (
                        <a
                          href={`https://maps.apple.com/?q=${encodeURIComponent(customerInfo?.address || job.propertyAddress || "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs mt-1 font-medium"
                          style={{ color: "#2563EB" }}
                        >
                          Open in Maps
                        </a>
                      )}
                    </div>
                  </div>
                  {customerInfo?.phone && (
                    <a href={`tel:${customerInfo.phone}`} className="block w-full text-center py-3 rounded-xl text-sm font-semibold mt-2" style={{ background: "linear-gradient(135deg, #16A34A, #22C55E)", color: "#fff" }}>
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        Call Customer
                      </span>
                    </a>
                  )}
                </div>
              )}
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
              {availableCategories.map((cat) => (
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
              {qbItemsLoading && (
                <div className="text-center py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Loading QuickBooks inventory...
                </div>
              )}
              {filteredMaterials.map((material) => (
                <button
                  key={material.id}
                  onClick={() => addMaterial(material)}
                  className="w-full flex items-center justify-between bg-[var(--color-surface-3)] rounded-xl p-3 border border-gray-700 hover:border-blue-600 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium">{material.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[material.category] || "bg-gray-500/20 text-gray-400"}`}>
                        {material.category}
                      </span>
                      {material.sku && (
                        <span className="text-xs text-gray-500">SKU: {material.sku}</span>
                      )}
                      <span className="text-xs text-gray-400">per {material.unit}</span>
                    </div>
                    {material.qtyOnHand != null && (
                      <p className="text-xs mt-1" style={{ color: material.qtyOnHand > 0 ? "#15803D" : "#DC2626" }}>
                        {material.qtyOnHand > 0 ? `${material.qtyOnHand} in stock` : "Out of stock"}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-blue-600">${material.unitPrice.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">/{material.unit}</p>
                    {material.source === "quickbooks" && (
                      <p className="text-[10px] text-orange-400 mt-0.5">QB</p>
                    )}
                  </div>
                </button>
              ))}
              {filteredMaterials.length === 0 && !qbItemsLoading && (
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

      {activePhoto && (
        <div className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0" onClick={() => setLightboxIndex(null)} />
          <div className="relative w-full max-w-3xl rounded-2xl overflow-hidden bg-black">
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-black/55">
              <div>
                <div className="text-sm font-semibold">{activePhoto.label || activePhoto.caption || "Job photo"}</div>
                <div className="text-xs text-white/70">{lightboxIndex! + 1} of {(job.photos || []).length}</div>
              </div>
              <button onClick={() => setLightboxIndex(null)} className="text-sm text-white/80">Close</button>
            </div>
            <div className="relative flex items-center justify-center min-h-[60vh]">
              <img src={activePhoto.uri} alt={activePhoto.label || activePhoto.caption || "Job photo"} className="max-h-[75vh] w-auto max-w-full object-contain" />
              {(job.photos || []).length > 1 && (
                <>
                  <button
                    onClick={() => setLightboxIndex((prev) => (prev === null ? 0 : (prev - 1 + (job.photos || []).length) % (job.photos || []).length))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 px-3 py-2 rounded-full bg-black/55"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setLightboxIndex((prev) => (prev === null ? 0 : (prev + 1) % (job.photos || []).length))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-2 rounded-full bg-black/55"
                  >
                    ›
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <TechBottomNav active="jobs" />
    </div>
  );
}
