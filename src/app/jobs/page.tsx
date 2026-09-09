"use client";

import { useEffect, useRef, useState } from "react";
import { Brush, ClipboardList, Hammer, RefreshCw, RotateCcw, Search, SlidersHorizontal, Wrench, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import TimeSelect from "@/components/scheduling/TimeSelect";
import JobTypeOptions from "@/components/job-form/JobTypeOptions";
import CustomJobTypeInput from "@/components/job-form/CustomJobTypeInput";
import { customerAddress, fetchJobArray, localDateValue, requireJobResponse, resolveJobType, scheduledDateLabel, scheduledTimeLabel } from "@/components/job-form/job-form-helpers";
import { useJobFormResource } from "@/components/job-form/useJobFormResource";

type Job = {
  id: string;
  jobNumber: string;
  title: string;
  customerId: string;
  customerName: string;
  propertyAddress: string;
  linkedInvoiceId?: string;
  linkedEstimateId?: string;
  linkedDocumentNumber?: string;
  fireplaceUnit?: { brand: string; model: string; nickname?: string };
  jobType: string;
  status: string;
  priority: string;
  scheduledDate: string;
  scheduledTimeStart: string;
  scheduledTimeEnd: string;
  assignedTechs: Array<{ id: string; name: string; color: string }>;
  totalAmount: number;
  notes?: string;
  photos?: Array<{ id: string; label?: string; timestamp?: string; uri?: string }>;
  checklistItems?: Record<string, boolean>;
};

type Tech = { id: string; name: string; color: string };
type RelatedDoc = {
  id: string;
  invoiceNumber?: string;
  estimateNumber?: string;
  issueDate?: string;
  dueDate?: string;
  txnDate?: string;
  expirationDate?: string;
  status?: string;
  totalAmount: number;
  balance?: number;
  linked?: boolean;
  jobTitle?: string;
};

type RelatedInvoicePreview = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  status: string;
  totalAmount: number;
  balance: number;
  notes?: string;
  lineItems: Array<{
    id: string;
    description: string;
    partNumber?: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
};

type RelatedEstimatePreview = {
  Id: string;
  DocNumber?: string;
  CustomerRef?: { name?: string };
  TxnDate?: string;
  ExpirationDate?: string;
  PrivateNote?: string;
  TotalAmt?: number;
  Line?: Array<{
    Amount?: number;
    Description?: string;
    SalesItemLineDetail?: {
      Qty?: number;
      UnitPrice?: number;
      ItemRef?: { name?: string };
    };
  }>;
};

type SelectedRelatedDocument =
  | { type: "invoice"; source: "quickbooks" | "local"; id: string }
  | { type: "estimate"; source: "quickbooks"; id: string };

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "rgba(29,78,216,0.12)", text: "#2563EB", border: "rgba(29,78,216,0.25)" },
  in_progress: { bg: "rgba(255,68,0,0.12)", text: "#f8971f", border: "rgba(255,68,0,0.25)" },
  completed: { bg: "rgba(152,205,0,0.12)", text: "#98CD00", border: "rgba(152,205,0,0.25)" },
  cancelled: { bg: "rgba(255,32,78,0.12)", text: "#FF204E", border: "rgba(255,32,78,0.25)" },
  on_hold: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af", border: "rgba(156,163,175,0.25)" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af" },
  normal: { bg: "rgba(29,78,216,0.12)", text: "#2563EB" },
  high: { bg: "rgba(255,68,0,0.12)", text: "#f8971f" },
  urgent: { bg: "rgba(255,32,78,0.12)", text: "#FF204E" },
};

const jobTypeIcons: Record<string, typeof Wrench> = {
  installation: Hammer,
  service: Wrench,
  "wood-service": Wrench,
  "pellet-service": Wrench,
  inspection: Search,
  cleaning: Brush,
  repair: Zap,
  estimate: ClipboardList,
  "follow-up": RotateCcw,
  custom: SlidersHorizontal,
};

function renderJobTypeIcon(jobType: string) {
  const Icon = jobTypeIcons[jobType] || ClipboardList;
  return <Icon size={18} aria-hidden="true" />;
}

function addMinutes(time: string, minutesToAdd: number) {
  const [hours, minutes] = time.split(":").map(Number);
  const total = Math.min((hours * 60) + minutes + minutesToAdd, 23 * 60 + 45);
  const nextHours = Math.floor(total / 60);
  const nextMinutes = total % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function buildPrefillTitle(prefillTitle: string | null, customerName: string | null, jobType: string | null) {
  const cleanedTitle = (prefillTitle || "").trim();
  if (cleanedTitle && cleanedTitle.toLowerCase() !== "new job") return cleanedTitle;
  const cleanedCustomer = (customerName || "").trim();
  const cleanedType = (jobType || "service").trim();
  return cleanedCustomer ? `${cleanedCustomer} - ${cleanedType}` : "New Job";
}

function formatTimeLabel(value: string) {
  return scheduledTimeLabel(value);
}

function checklistTemplateForJobType(jobType: string) {
  if (jobType === "inspection" || jobType === "cleaning" || jobType === "service") {
    return [
      { id: "1", task: "Visual inspection of unit exterior" },
      { id: "2", task: "Check pilot light and ignition" },
      { id: "3", task: "Inspect gas lines for leaks" },
      { id: "4", task: "Clean glass and interior" },
      { id: "5", task: "Check venting system" },
      { id: "6", task: "Test thermostat/remote" },
      { id: "7", task: "Verify proper combustion" },
      { id: "8", task: "Final photo of completed work" },
    ];
  }

  return [
    { id: "1", task: "Verify unit matches order" },
    { id: "2", task: "Install gas line connection" },
    { id: "3", task: "Install venting system" },
    { id: "4", task: "Connect electrical" },
    { id: "5", task: "Test all functions" },
    { id: "6", task: "Customer walkthrough" },
    { id: "7", task: "Final installation photo" },
  ];
}

export default function JobsPage() {
  const searchParams = useSearchParams();
  const jobResource = useJobFormResource<Job>("/api/jobs?limit=1000", "jobs");
  const techResource = useJobFormResource<Tech>("/api/techs?activeOnly=true", "techs");
  const { data: jobs, setData: setJobs, reload: loadJobs } = jobResource;
  const techs = techResource.data;
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingJob, setOpeningJob] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openRetry, setOpenRetry] = useState(0);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextRetry, setContextRetry] = useState(0);
  const [contextJobId, setContextJobId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [jobsTab, setJobsTab] = useState<"active" | "completed">("active");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string; address?: string }[]>([]);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; address?: string } | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const selectedJobIdRef = useRef<string | null>(null);
  const [jobContext, setJobContext] = useState<{
    localInvoices: RelatedDoc[];
    quickbooksInvoices: RelatedDoc[];
    quickbooksEstimates: RelatedDoc[];
  } | null>(null);
  const [selectedRelatedDocument, setSelectedRelatedDocument] = useState<SelectedRelatedDocument | null>(null);
  const [relatedDocumentPreview, setRelatedDocumentPreview] = useState<RelatedInvoicePreview | RelatedEstimatePreview | null>(null);
  const [loadingRelatedDocument, setLoadingRelatedDocument] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editingJob, setEditingJob] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    propertyAddress: "",
    jobType: "service",
    customJobType: "",
    priority: "normal",
    scheduledDate: "",
    scheduledTimeStart: "09:00",
    scheduledTimeEnd: "10:00",
    notes: "",
    assignedTechs: [] as string[],
  });
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    propertyAddress: "",
    jobType: "service",
    customJobType: "",
    priority: "normal",
    scheduledDate: localDateValue(),
    scheduledTimeStart: "09:00",
    scheduledTimeEnd: "10:00",
    notes: "",
    assignedTechs: [] as string[],
  });

  const requestedJobId = searchParams.get("id") || searchParams.get("highlight");
  useEffect(() => {
    const controller = new AbortController();
    setOpenError(null);
    setOpeningJob(Boolean(requestedJobId));
    if (!requestedJobId) return;
    setSelectedJob(null);
    void fetchJobArray<Job>(`/api/jobs?id=${encodeURIComponent(requestedJobId)}`, "jobs", controller.signal)
      .then((records) => {
        if (controller.signal.aborted) return;
        const exactJob = records.find((job) => job.id === requestedJobId);
        if (!exactJob) throw new Error("This job was not found or is no longer available to you.");
        setSelectedJob(exactJob);
        setJobsTab(["completed", "cancelled"].includes(exactJob.status) ? "completed" : "active");
      })
      .catch((error) => { if (!controller.signal.aborted) setOpenError(error.message || "Could not open this job."); })
      .finally(() => { if (!controller.signal.aborted) setOpeningJob(false); });
    return () => controller.abort();
  }, [requestedJobId, openRetry]);

  useEffect(() => {
    if (!showCreateModal) return;
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
      const res = await fetch(`/api/customer-lookup?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      const data = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error(data.error || "Customer search failed");
      setCustomerSearchError(null);
      setCustomerResults((data.customers || []).map((c: any) => ({
        id: c.id,
        name: c.displayName,
        address: customerAddress(c.address),
      })));
      } catch {
        if (!controller.signal.aborted) {
          setCustomerResults([]);
          setCustomerSearchError("Customer search failed. Please try again.");
        }
      }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [customerQuery, showCreateModal]);

  useEffect(() => {
    const prefillCustomerId = searchParams.get("customerId");
    const prefillCustomerName = searchParams.get("customerName");
    const prefillTitle = searchParams.get("title");
    const prefillAddress = searchParams.get("address");
    const prefillJobType = searchParams.get("jobType");
    const shouldOpen = searchParams.get("create") === "1";

    if (!shouldOpen) return;

    setShowCreateModal(true);
    if (prefillCustomerId || prefillCustomerName) {
      setSelectedCustomer({
        id: prefillCustomerId || "",
        name: prefillCustomerName || "",
        address: prefillAddress || "",
      });
      setCustomerQuery("");
    }
    setFormData((prev) => ({
      ...prev,
      title: buildPrefillTitle(prefillTitle, prefillCustomerName, prefillJobType),
      propertyAddress: prefillAddress || prev.propertyAddress,
      jobType: (prefillJobType as any) || prev.jobType,
    }));
  }, [searchParams]);

  useEffect(() => {
    selectedJobIdRef.current = selectedJob?.id || null;
  }, [selectedJob?.id]);

  useEffect(() => {
    // An edit session owns its draft until Save or Cancel, including during refreshes.
    if (editingJob || savingEdit) return;
    setSelectedJob((current) => current ? jobs.find((job) => job.id === current.id) || current : null);
  }, [jobs, editingJob, savingEdit]);

  useEffect(() => {
    const controller = new AbortController();
    setContextJobId(null);
    setJobContext(null);
    setSelectedRelatedDocument(null);
    setRelatedDocumentPreview(null);
    setLightboxIndex(null);
    setEditingJob(false);
    setContextError(null);
    setContextLoading(Boolean(selectedJob?.id));
    if (!selectedJob?.id) return;
    const jobId = selectedJob.id;
    void fetch(`/api/jobs/context?id=${encodeURIComponent(jobId)}`, { signal: controller.signal })
      .then((res) => requireJobResponse(res, "Could not load related documents"))
      .then((res) => res.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        if (![data.related?.localInvoices, data.related?.quickbooksInvoices, data.related?.quickbooksEstimates].every(Array.isArray)) throw new Error("Could not load related documents: invalid response.");
        setJobContext(data.related);
        setContextJobId(jobId);
      })
      .catch((error) => { if (!controller.signal.aborted) setContextError(error.message || "Could not load related documents."); })
      .finally(() => { if (!controller.signal.aborted) setContextLoading(false); });
    return () => controller.abort();
  }, [selectedJob?.id, contextRetry]);

  useEffect(() => {
    if (!selectedJob || !jobContext || contextJobId !== selectedJob.id) return;
    if (selectedRelatedDocument) return;

    const linkedInvoice = jobContext.quickbooksInvoices.find((doc) => doc.linked) || jobContext.localInvoices[0];
    if (linkedInvoice) {
      setSelectedRelatedDocument({
        type: "invoice",
        source: jobContext.quickbooksInvoices.some((doc) => doc.id === linkedInvoice.id) ? "quickbooks" : "local",
        id: linkedInvoice.id,
      });
      return;
    }

    const linkedEstimate = jobContext.quickbooksEstimates.find((doc) => doc.linked) || jobContext.quickbooksEstimates[0];
    if (linkedEstimate) {
      setSelectedRelatedDocument({ type: "estimate", source: "quickbooks", id: linkedEstimate.id });
    }
  }, [jobContext, contextJobId, selectedJob, selectedRelatedDocument]);

  useEffect(() => {
    setPreviewError(null);
    if (!selectedRelatedDocument || contextJobId !== selectedJob?.id) {
      setRelatedDocumentPreview(null);
      setLoadingRelatedDocument(false);
      return;
    }
    const activeDocument = selectedRelatedDocument;

    let cancelled = false;

    async function loadRelatedDocument() {
      setLoadingRelatedDocument(true);
      try {
        if (activeDocument.type === "invoice") {
          const endpoint = activeDocument.source === "local"
            ? `/api/invoices?id=${encodeURIComponent(activeDocument.id)}`
            : `/api/quickbooks/invoices?id=${encodeURIComponent(activeDocument.id)}&live=true`;
          const res = await fetch(endpoint, { cache: "no-store" });
          await requireJobResponse(res, "Could not load invoice");
          const data = await res.json();
          if (!cancelled) {
            setRelatedDocumentPreview(res.ok ? (data.invoice || null) : null);
          }
          return;
        }

        const res = await fetch(`/api/quickbooks/estimates?id=${encodeURIComponent(activeDocument.id)}`, {
          cache: "no-store",
        });
        await requireJobResponse(res, "Could not load estimate");
        const data = await res.json();
        if (!cancelled) {
          setRelatedDocumentPreview(res.ok ? (data.estimate || null) : null);
        }
      } catch {
        if (!cancelled) {
          setRelatedDocumentPreview(null);
          setPreviewError("Could not load this document. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoadingRelatedDocument(false);
        }
      }
    }

    loadRelatedDocument();

    return () => {
      cancelled = true;
    };
  }, [selectedRelatedDocument, selectedJob?.id, contextJobId, previewRetry]);

  useEffect(() => {
    if (!selectedJob) {
      setEditingJob(false);
      return;
    }
    if (editingJob) return;
    setEditForm({
      title: selectedJob.title,
      propertyAddress: selectedJob.propertyAddress || "",
      jobType: selectedJob.jobType || "service",
      customJobType: "",
      priority: selectedJob.priority || "normal",
      scheduledDate: selectedJob.scheduledDate || localDateValue(),
      scheduledTimeStart: selectedJob.scheduledTimeStart || "09:00",
      scheduledTimeEnd: selectedJob.scheduledTimeEnd || "10:00",
      notes: selectedJob.notes || "",
      assignedTechs: selectedJob.assignedTechs.map((tech) => tech.id),
    });
  }, [selectedJob, editingJob]);

  const filteredJobs = jobs.filter((job) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      job.jobNumber.toLowerCase().includes(q) ||
      job.title.toLowerCase().includes(q) ||
      job.customerName.toLowerCase().includes(q) ||
      (job.propertyAddress || "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    const matchesJobType = jobTypeFilter === "all" || job.jobType === jobTypeFilter;
    // Tab filter
    const isCompleted = job.status === "completed" || job.status === "cancelled";
    const matchesTab = jobsTab === "completed" ? isCompleted : !isCompleted;
    return matchesSearch && matchesStatus && matchesJobType && matchesTab;
  });

  const activeCount = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled").length;
  const completedCount = jobs.filter((j) => j.status === "completed" || j.status === "cancelled").length;

  const activeRelatedInvoice = selectedRelatedDocument?.type === "invoice"
    ? (relatedDocumentPreview as RelatedInvoicePreview | null)
    : null;
  const activeRelatedEstimate = selectedRelatedDocument?.type === "estimate"
    ? (relatedDocumentPreview as RelatedEstimatePreview | null)
    : null;

  function openRelatedInvoice(id: string, source: "quickbooks" | "local") {
    setRelatedDocumentPreview(null);
    setLoadingRelatedDocument(true);
    setSelectedRelatedDocument({ type: "invoice", id, source });
  }

  function openRelatedEstimate(id: string) {
    setRelatedDocumentPreview(null);
    setLoadingRelatedDocument(true);
    setSelectedRelatedDocument({ type: "estimate", id, source: "quickbooks" });
  }

  const selectedJobPhotos = selectedJob?.photos || [];
  const activeLightboxPhoto = lightboxIndex === null ? null : selectedJobPhotos[lightboxIndex] || null;

  async function handleCreateJob() {
    if (!selectedCustomer || !formData.title) return;
    setCreating(true);
    setMutationError(null);
    try {
      const assignedTechs = techs
        .filter((t) => formData.assignedTechs.includes(t.id))
        .map((t) => ({ id: t.id, name: t.name, color: t.color }));

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          propertyAddress: formData.propertyAddress || selectedCustomer.address || "",
          jobType: resolveJobType(formData.jobType, formData.customJobType),
          priority: formData.priority,
          scheduledDate: formData.scheduledDate,
          scheduledTimeStart: formData.scheduledTimeStart,
          scheduledTimeEnd: formData.scheduledTimeEnd,
          notes: formData.notes,
          assignedTechs,
          totalAmount: 0,
        }),
      });
      await requireJobResponse(res, "Could not create job");
      if (res.ok) {
        setShowCreateModal(false);
        setFormData({ ...formData, title: "", notes: "", assignedTechs: [], propertyAddress: "" });
        setSelectedCustomer(null);
        setCustomerQuery("");
        await loadJobs();
      }
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Could not create job. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteJob(jobId: string) {
    if (deleting) return;
    const ok = window.confirm("Delete this job?");
    if (!ok) return;
    setDeleting(true);
    setMutationError(null);
    try {
      await requireJobResponse(await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, { method: "DELETE" }), "Could not delete job");
      setSelectedJob((current) => current?.id === jobId ? null : current);
      setJobs((current) => current.filter((job) => job.id !== jobId));
      await loadJobs();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Could not delete job. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveJobEdits() {
    if (!selectedJob || savingEdit) return;
    const jobId = selectedJob.id;
    setSavingEdit(true);
    setMutationError(null);
    try {
      const availableTechs = [...techs, ...selectedJob.assignedTechs.filter((assigned) => !techs.some((tech) => tech.id === assigned.id))];
      const assignedTechs = availableTechs
        .filter((tech) => editForm.assignedTechs.includes(tech.id))
        .map((tech) => ({ id: tech.id, name: tech.name, color: tech.color }));
      const res = await fetch("/api/jobs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedJob.id,
          title: editForm.title,
          propertyAddress: editForm.propertyAddress,
          jobType: resolveJobType(editForm.jobType, editForm.customJobType),
          priority: editForm.priority,
          scheduledDate: editForm.scheduledDate,
          scheduledTimeStart: editForm.scheduledTimeStart,
          scheduledTimeEnd: editForm.scheduledTimeEnd,
          notes: editForm.notes,
          assignedTechs,
        }),
      });
      await requireJobResponse(res, "Could not save job");
      const data = await res.json();
      const savedJob: Job | undefined = data.job;
      if (!savedJob || savedJob.id !== jobId) throw new Error("Could not confirm the saved job. Refresh this job before trying again.");
      setJobs((current) => current.map((job) => job.id === jobId ? savedJob : job));
      if (selectedJobIdRef.current === jobId) {
        setSelectedJob((current) => current?.id === jobId ? savedJob : current);
        setEditingJob(false);
      }
      await loadJobs();
    } catch (error) {
      if (selectedJobIdRef.current === jobId) setMutationError(error instanceof Error ? error.message : "Could not save job. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Jobs</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>{jobResource.loaded ? `${filteredJobs.length} jobs found` : "Jobs"}</p>
          </div>
          <button aria-label="Refresh jobs" title="Refresh jobs" disabled={jobResource.loading} onClick={() => void loadJobs()} className="p-2 rounded-lg"><RefreshCw size={16} /></button>
          <button onClick={() => { setMutationError(null); setShowCreateModal(true); }} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "#C75300", color: "white" }}>New Job</button>
        </div>

        {/* Active / Completed tabs */}
        <div className="px-6 pt-3 pb-0 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <button
            onClick={() => { setJobsTab("active"); setStatusFilter("all"); }}
            className="px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              borderBottom: jobsTab === "active" ? "2px solid #2563EB" : "2px solid transparent",
              color: jobsTab === "active" ? "#2563EB" : "var(--color-text-muted)",
              marginBottom: -1,
            }}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => { setJobsTab("completed"); setStatusFilter("all"); }}
            className="px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              borderBottom: jobsTab === "completed" ? "2px solid #16A34A" : "2px solid transparent",
              color: jobsTab === "completed" ? "#16A34A" : "var(--color-text-muted)",
              marginBottom: -1,
            }}
          >
            Completed ({completedCount})
          </button>
        </div>

        <div className="px-6 py-3 flex flex-wrap items-center gap-3 flex-shrink-0" style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
          <input aria-label="Search jobs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search jobs..." className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
          {jobsTab === "active" ? (
            <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
              <option value="all">All Status</option><option value="scheduled">Scheduled</option><option value="in_progress">In Progress</option><option value="on_hold">On Hold</option>
            </select>
          ) : (
            <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
              <option value="all">All</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </select>
          )}
          <select aria-label="Filter job type" value={jobTypeFilter} onChange={(e) => setJobTypeFilter(e.target.value)} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
            <option value="all">All Types</option><JobTypeOptions values={jobs.map((job) => job.jobType)} />
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-6"><div className="space-y-3">
          {jobResource.loading && <p role="status" className="text-sm">{jobResource.loaded ? "Refreshing jobs..." : "Loading jobs..."}</p>}
          {jobResource.error && <div role="alert" className="text-sm text-red-600">{jobResource.error} {jobResource.loaded && "Showing previously loaded jobs."} <button className="underline" onClick={() => void loadJobs()}>Retry</button></div>}
          {openingJob && <p role="status" className="text-sm">Opening job...</p>}
          {openError && <div role="alert" className="text-sm text-red-600">{openError} <button className="underline" onClick={() => setOpenRetry((retry) => retry + 1)}>Retry opening job</button></div>}
          {mutationError && !showCreateModal && !selectedJob && <p role="alert" className="text-sm text-red-600">{mutationError}</p>}
          {jobResource.loaded && !jobResource.loading && !jobResource.error && filteredJobs.length === 0 && <p className="py-8 text-sm" style={{ color: "var(--color-text-secondary)" }}>{jobs.length ? "No jobs match these filters." : "No jobs yet."}</p>}
          {filteredJobs.map((job) => (
            <button key={job.id} onClick={() => { setMutationError(null); setSelectedJob(job); }} className="w-full rounded-lg p-4 text-left" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-lg" style={{ background: "var(--color-surface-3)" }}>{renderJobTypeIcon(job.jobType)}</div>
                  <div className="min-w-0 break-words">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}>{job.jobNumber}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: statusColors[job.status]?.bg, color: statusColors[job.status]?.text, border: `1px solid ${statusColors[job.status]?.border}` }}>{job.status.replace("_", " ").toUpperCase()}</span>
                      {job.priority !== "normal" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: priorityColors[job.priority]?.bg, color: priorityColors[job.priority]?.text }}>{job.priority.toUpperCase()}</span>}
                    </div>
                    <h3 className="font-semibold mt-1" style={{ color: "var(--color-text-primary)" }}>{job.title}</h3>
                    <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{job.customerName}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{job.propertyAddress || "—"}</p>
                    <p className="text-sm font-medium mt-2" style={{ color: "var(--color-text-primary)" }}><time dateTime={job.scheduledDate || undefined}>{scheduledDateLabel(job.scheduledDate)}</time><span className="block sm:inline">{" · "}{formatTimeLabel(job.scheduledTimeStart)}{job.scheduledTimeEnd && ` - ${formatTimeLabel(job.scheduledTimeEnd)}`}</span></p>
                  </div>
                </div>
                <div className="text-right"><div className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>${Number(job.totalAmount || 0).toFixed(2)}</div></div>
              </div>
            </button>
          ))}
        </div></div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateModal(false)} />
          <div className="relative w-full max-w-2xl rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}><h2 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>Create New Job</h2></div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {mutationError && <p role="alert" className="text-sm text-red-600">{mutationError}</p>}
              {techResource.error && <p role="alert" className="text-sm text-red-600">{techResource.error} <button className="underline" onClick={() => void techResource.reload()}>Retry technicians</button></p>}
              <input aria-label="Search customers..." placeholder="Search customers..." value={selectedCustomer?.name || customerQuery} onChange={(e) => { setSelectedCustomer(null); setCustomerQuery(e.target.value); }} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
              {customerSearchError && <p role="alert" className="text-sm text-red-600">{customerSearchError}</p>}
              {!!customerResults.length && !selectedCustomer && <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>{customerResults.map((c) => <button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerResults([]); setFormData((prev) => ({ ...prev, propertyAddress: c.address || prev.propertyAddress })); }} className="w-full text-left px-3 py-2 text-sm">{c.name}<span className="block text-xs" style={{ color: "var(--color-text-muted)" }}>{c.address}</span></button>)}</div>}
              <input aria-label="Job title" placeholder="Job title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
              <input aria-label="Property address" placeholder="Property address" value={formData.propertyAddress} onChange={(e) => setFormData({ ...formData, propertyAddress: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select aria-label="Job type" value={formData.jobType} onChange={(e) => setFormData({ ...formData, jobType: e.target.value })} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
                  <JobTypeOptions values={[formData.jobType]} />
                </select>
                <select aria-label="Priority" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
              {formData.jobType === "custom" && <CustomJobTypeInput value={formData.customJobType} onChange={(value) => setFormData((prev) => ({ ...prev, customJobType: value }))} />}
                </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input aria-label="Scheduled date" type="date" value={formData.scheduledDate} onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                <label className="min-w-0 flex flex-col gap-1 text-xs">Start time<TimeSelect value={formData.scheduledTimeStart} onChange={(value) => setFormData({ ...formData, scheduledTimeStart: value })} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} /></label>
                <label className="min-w-0 flex flex-col gap-1 text-xs">End time<TimeSelect value={formData.scheduledTimeEnd} onChange={(value) => setFormData({ ...formData, scheduledTimeEnd: value })} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} /></label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Duration</span>
                {[60, 120, 180].map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => setFormData({ ...formData, scheduledTimeEnd: addMinutes(formData.scheduledTimeStart, minutes) })}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                  >
                    {minutes === 60 ? "1 hr" : minutes === 120 ? "2 hr" : "3 hr"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">{techs.map((t) => (
                <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <input type="checkbox" checked={formData.assignedTechs.includes(t.id)} onChange={(e) => setFormData({ ...formData, assignedTechs: e.target.checked ? [...formData.assignedTechs, t.id] : formData.assignedTechs.filter((id) => id !== t.id) })} />
                  <span className="text-sm">{t.name}</span>
                </label>
              ))}</div>
            </div>
            <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: "1px solid var(--color-border)" }}>
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>Cancel</button>
              <button onClick={handleCreateJob} disabled={creating || !selectedCustomer || !formData.title} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "#C75300", color: "white" }}>{creating ? "Creating..." : "Create Job"}</button>
            </div>
          </div>
        </div>
      )}

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedJob(null)} />
          <div className="relative w-full max-w-xl rounded-xl overflow-hidden max-h-[90vh] flex flex-col" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="px-6 py-4 flex items-start justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "var(--color-surface-3)", color: "var(--color-text-muted)" }}>{selectedJob.jobNumber}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: statusColors[selectedJob.status]?.bg, color: statusColors[selectedJob.status]?.text, border: `1px solid ${statusColors[selectedJob.status]?.border}` }}>{selectedJob.status.replace("_", " ").toUpperCase()}</span>
                </div>
                <h2 className="font-bold text-lg mt-2" style={{ color: "var(--color-text-primary)" }}>{selectedJob.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                {editingJob ? (
                  <>
                    <button onClick={() => setEditingJob(false)} className="text-sm" style={{ color: "var(--color-text-muted)" }}>Cancel</button>
                    <button disabled={savingEdit} onClick={handleSaveJobEdits} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: "#C75300", color: "white" }}>
                      {savingEdit ? "Saving..." : "Save"}
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditingJob(true)} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: "rgba(37,99,235,0.12)", color: "#2563EB", border: "1px solid rgba(37,99,235,0.25)" }}>
                    Edit
                  </button>
                )}
                <button onClick={() => setSelectedJob(null)} className="text-sm" style={{ color: "var(--color-text-muted)" }}>Close</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
            {mutationError && <p role="alert" className="px-6 py-2 text-sm text-red-600">{mutationError}</p>}
            {editingJob && techResource.error && <p role="alert" className="px-6 py-2 text-sm text-red-600">{techResource.error} <button className="underline" onClick={() => void techResource.reload()}>Retry technicians</button></p>}
            {editingJob ? (
              <div className="p-6 space-y-4">
                <input aria-label="Job title" value={editForm.title} onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                <input aria-label="Property address" value={editForm.propertyAddress} onChange={(e) => setEditForm((prev) => ({ ...prev, propertyAddress: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select aria-label="Job type" value={editForm.jobType} onChange={(e) => setEditForm((prev) => ({ ...prev, jobType: e.target.value }))} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
                    <JobTypeOptions values={[editForm.jobType]} />
                  </select>
                  <select aria-label="Priority" value={editForm.priority} onChange={(e) => setEditForm((prev) => ({ ...prev, priority: e.target.value }))} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
                    <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                  </select>
                {editForm.jobType === "custom" && <CustomJobTypeInput value={editForm.customJobType} onChange={(value) => setEditForm((prev) => ({ ...prev, customJobType: value }))} />}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input aria-label="Scheduled date" type="date" value={editForm.scheduledDate} onChange={(e) => setEditForm((prev) => ({ ...prev, scheduledDate: e.target.value }))} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                  <label className="min-w-0 flex flex-col gap-1 text-xs">Start time<TimeSelect value={editForm.scheduledTimeStart} onChange={(value) => setEditForm((prev) => ({ ...prev, scheduledTimeStart: value }))} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} /></label>
                  <label className="min-w-0 flex flex-col gap-1 text-xs">End time<TimeSelect value={editForm.scheduledTimeEnd} onChange={(value) => setEditForm((prev) => ({ ...prev, scheduledTimeEnd: value }))} className="min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} /></label>
                </div>
                <textarea aria-label="Notes" value={editForm.notes} onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                <div className="flex flex-wrap gap-2">
                  {techs.map((tech) => (
                    <label key={tech.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                      <input
                        type="checkbox"
                        checked={editForm.assignedTechs.includes(tech.id)}
                        onChange={(e) => setEditForm((prev) => ({
                          ...prev,
                          assignedTechs: e.target.checked
                            ? [...prev.assignedTechs, tech.id]
                            : prev.assignedTechs.filter((id) => id !== tech.id),
                        }))}
                      />
                      <span className="text-sm">{tech.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Customer</div>
                <div className="font-semibold mt-1" style={{ color: "var(--color-text-primary)" }}>{selectedJob.customerName}</div>
                <div className="text-sm mt-2" style={{ color: "var(--color-text-secondary)" }}>{selectedJob.propertyAddress || "No property address"}</div>
              </div>
              <div className="rounded-lg p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Schedule</div>
                <div className="font-semibold mt-1" style={{ color: "var(--color-text-primary)" }}>{scheduledDateLabel(selectedJob.scheduledDate)}</div>
                <div className="text-sm mt-2" style={{ color: "var(--color-text-secondary)" }}>{formatTimeLabel(selectedJob.scheduledTimeStart)} - {formatTimeLabel(selectedJob.scheduledTimeEnd)}</div>
              </div>
              <div className="rounded-lg p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Type</div>
              <div className="font-semibold mt-1" style={{ color: "var(--color-text-primary)" }}>{selectedJob.jobType}</div>
                <div className="text-sm mt-2" style={{ color: priorityColors[selectedJob.priority]?.text || "var(--color-text-secondary)" }}>{selectedJob.priority.toUpperCase()} priority</div>
              </div>
              <div className="rounded-lg p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Assigned Techs</div>
                <div className="text-sm mt-2" style={{ color: "var(--color-text-secondary)" }}>
                  {selectedJob.assignedTechs.length ? selectedJob.assignedTechs.map((tech) => tech.name).join(", ") : "Unassigned"}
                </div>
              </div>
              <div className="rounded-lg p-4 md:col-span-2" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="text-xs uppercase tracking-wide mb-3" style={{ color: "var(--color-text-muted)" }}>Related Documents</div>
                {contextLoading && <p role="status" className="text-sm">Loading related documents...</p>}
                {contextError && <p role="alert" className="text-sm text-red-600">{contextError} <button className="underline" onClick={() => setContextRetry((retry) => retry + 1)}>Retry documents</button></p>}
                {previewError && <p role="alert" className="text-sm text-red-600">{previewError} <button className="underline" onClick={() => setPreviewRetry((retry) => retry + 1)}>Retry preview</button></p>}
                {(selectedRelatedDocument || loadingRelatedDocument) && (
                  <div key={selectedRelatedDocument ? `${selectedRelatedDocument.type}-${selectedRelatedDocument.id}-${selectedRelatedDocument.source}` : "loading"} className="mb-4 rounded-lg p-4 space-y-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                          {selectedRelatedDocument?.type === "estimate" ? "Estimate Preview" : "Invoice Preview"}
                        </div>
                        <div className="text-sm mt-1 font-semibold" style={{ color: "var(--color-text-primary)" }}>
                          Tap any related document below to switch the preview.
                        </div>
                      </div>
                      {selectedRelatedDocument && (
                        <button
                          onClick={() => {
                            setSelectedRelatedDocument(null);
                            setRelatedDocumentPreview(null);
                          }}
                          className="text-xs font-medium"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {loadingRelatedDocument && (
                      <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading document preview...</div>
                    )}
                    {!loadingRelatedDocument && activeRelatedInvoice && (
                      <>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>Invoice {activeRelatedInvoice.invoiceNumber}</div>
                            <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                              {activeRelatedInvoice.customerName} • {activeRelatedInvoice.issueDate}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>${Number(activeRelatedInvoice.totalAmount || 0).toFixed(2)}</div>
                            <div className="text-xs" style={{ color: Number(activeRelatedInvoice.balance || 0) > 0 ? "#FF204E" : "#98CD00" }}>
                              {activeRelatedInvoice.status} • ${Number(activeRelatedInvoice.balance || 0).toFixed(2)} open
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {activeRelatedInvoice.lineItems.map((line) => (
                            <div key={line.id} className="rounded-lg px-3 py-2" style={{ background: "var(--color-surface-2)" }}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{line.description}</div>
                                  {line.partNumber && (
                                    <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Part: {line.partNumber}</div>
                                  )}
                                  <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                                    {line.qty} × ${Number(line.unitPrice || 0).toFixed(2)}
                                  </div>
                                </div>
                                <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>${Number(line.total || 0).toFixed(2)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {activeRelatedInvoice.notes && (
                          <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>
                            {activeRelatedInvoice.notes}
                          </div>
                        )}
                      </>
                    )}
                    {!loadingRelatedDocument && activeRelatedEstimate && (
                      <>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>Estimate {activeRelatedEstimate.DocNumber || activeRelatedEstimate.Id}</div>
                            <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                              {activeRelatedEstimate.CustomerRef?.name || selectedJob.customerName}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>${Number(activeRelatedEstimate.TotalAmt || 0).toFixed(2)}</div>
                            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                              {activeRelatedEstimate.TxnDate || activeRelatedEstimate.ExpirationDate || ""}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {(activeRelatedEstimate.Line || []).map((line, index) => (
                            <div key={`${activeRelatedEstimate.Id}-line-${index}`} className="rounded-lg px-3 py-2" style={{ background: "var(--color-surface-2)" }}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                                    {line.Description || line.SalesItemLineDetail?.ItemRef?.name || "Estimate line"}
                                  </div>
                                  {line.SalesItemLineDetail?.ItemRef?.name && (
                                    <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                                      Part: {line.SalesItemLineDetail.ItemRef.name}
                                    </div>
                                  )}
                                  <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                                    {Number(line.SalesItemLineDetail?.Qty || 1)} × ${Number(line.SalesItemLineDetail?.UnitPrice || line.Amount || 0).toFixed(2)}
                                  </div>
                                </div>
                                <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>${Number(line.Amount || 0).toFixed(2)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {activeRelatedEstimate.PrivateNote && (
                          <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>
                            {activeRelatedEstimate.PrivateNote}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {(jobContext?.quickbooksInvoices || []).map((invoice) => (
                    <button
                      key={`qbi-${invoice.id}`}
                      onClick={() => openRelatedInvoice(invoice.id, "quickbooks")}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left"
                      style={{
                        background: selectedRelatedDocument?.type === "invoice" && selectedRelatedDocument.id === invoice.id ? "rgba(29,78,216,0.12)" : "var(--color-surface-1)",
                        border: selectedRelatedDocument?.type === "invoice" && selectedRelatedDocument.id === invoice.id ? "1px solid rgba(29,78,216,0.25)" : "1px solid transparent",
                      }}
                    >
                      <div>
                        <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Invoice {invoice.invoiceNumber}</div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{invoice.txnDate || invoice.issueDate || ""}{invoice.linked ? " · linked" : ""}</div>
                      </div>
                      <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>${Number(invoice.totalAmount || 0).toFixed(2)}</div>
                    </button>
                  ))}
                  {(jobContext?.quickbooksEstimates || []).map((estimate) => (
                    <button
                      key={`qbe-${estimate.id}`}
                      onClick={() => openRelatedEstimate(estimate.id)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left"
                      style={{
                        background: selectedRelatedDocument?.type === "estimate" && selectedRelatedDocument.id === estimate.id ? "rgba(29,78,216,0.12)" : "var(--color-surface-1)",
                        border: selectedRelatedDocument?.type === "estimate" && selectedRelatedDocument.id === estimate.id ? "1px solid rgba(29,78,216,0.25)" : "1px solid transparent",
                      }}
                    >
                      <div>
                        <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Estimate {estimate.estimateNumber}</div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{estimate.txnDate || estimate.expirationDate || ""}{estimate.linked ? " · linked" : ""}</div>
                      </div>
                      <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>${Number(estimate.totalAmount || 0).toFixed(2)}</div>
                    </button>
                  ))}
                  {(jobContext?.localInvoices || []).map((invoice) => (
                    <button
                      key={`local-${invoice.id}`}
                      onClick={() => openRelatedInvoice(invoice.id, "local")}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left"
                      style={{
                        background: selectedRelatedDocument?.type === "invoice" && selectedRelatedDocument.id === invoice.id ? "rgba(29,78,216,0.12)" : "var(--color-surface-1)",
                        border: selectedRelatedDocument?.type === "invoice" && selectedRelatedDocument.id === invoice.id ? "1px solid rgba(29,78,216,0.25)" : "1px solid transparent",
                      }}
                    >
                      <div>
                        <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Local Invoice {invoice.invoiceNumber}</div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{invoice.issueDate || ""}{invoice.jobTitle ? ` · ${invoice.jobTitle}` : ""}</div>
                      </div>
                      <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>${Number(invoice.totalAmount || 0).toFixed(2)}</div>
                    </button>
                  ))}
                  {jobContext && !contextLoading && !contextError && !jobContext.quickbooksInvoices.length && !jobContext.quickbooksEstimates.length && !jobContext.localInvoices.length && (
                    <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>No related invoice or estimate found yet.</div>
                  )}
                </div>
              </div>
              <div className="rounded-lg p-4 md:col-span-2" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="text-xs uppercase tracking-wide mb-3" style={{ color: "var(--color-text-muted)" }}>Tech Checklist</div>
                <div className="space-y-2">
                  {checklistTemplateForJobType(selectedJob.jobType).map((item) => {
                    const done = Boolean(selectedJob.checklistItems?.[item.id]);
                    const linkedPhotos = (selectedJob.photos || []).filter((photo) => String((photo as any).checklistItemId || "") === item.id);
                    return (
                      <div key={item.id} className="rounded-lg px-3 py-2" style={{ background: "var(--color-surface-1)" }}>
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs" style={{ background: done ? "rgba(152,205,0,0.18)" : "var(--color-surface-3)", color: done ? "#98CD00" : "var(--color-text-muted)" }}>
                            {done ? "✓" : ""}
                          </div>
                          <div className="text-sm" style={{ color: done ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>{item.task}</div>
                        </div>
                        {linkedPhotos.length > 0 && (
                          <div className="mt-3 grid grid-cols-4 gap-2">
                            {linkedPhotos.map((photo) => {
                              const globalIndex = selectedJobPhotos.findIndex((entry) => entry.id === photo.id);
                              return (
                              <button
                                key={photo.id}
                                onClick={() => setLightboxIndex(globalIndex >= 0 ? globalIndex : 0)}
                                className="rounded-lg overflow-hidden block"
                                style={{ background: "var(--color-surface-2)" }}
                              >
                                <div className="aspect-square" style={{ backgroundImage: `url(${photo.uri})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                              </button>
                            );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-lg p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="text-xs uppercase tracking-wide mb-3" style={{ color: "var(--color-text-muted)" }}>Tech Notes</div>
                <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>{selectedJob.notes || "No tech notes yet."}</div>
              </div>
              <div className="rounded-lg p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="text-xs uppercase tracking-wide mb-3" style={{ color: "var(--color-text-muted)" }}>Photos</div>
                {selectedJob.photos?.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {selectedJob.photos.map((photo, index) => (
                      <button key={photo.id} onClick={() => setLightboxIndex(index)} className="rounded-lg overflow-hidden block" style={{ background: "var(--color-surface-1)" }}>
                        <div className="aspect-square" style={{ backgroundImage: `url(${photo.uri})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>No photos uploaded yet.</div>
                )}
              </div>
            </div>
            )}
            </div>
            <div className="px-6 py-4 flex justify-end border-t" style={{ borderColor: "var(--color-border)" }}>
              <button disabled={deleting} onClick={() => handleDeleteJob(selectedJob.id)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "rgba(255,32,78,0.12)", color: "#FF204E", border: "1px solid rgba(255,32,78,0.25)" }}>
                Delete Job
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedJob && activeLightboxPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setLightboxIndex(null)} />
          <div className="relative w-full max-w-4xl rounded-2xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{activeLightboxPhoto.label || "Job photo"}</div>
                <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {lightboxIndex! + 1} of {selectedJobPhotos.length}
                </div>
              </div>
              <button onClick={() => setLightboxIndex(null)} className="text-sm" style={{ color: "var(--color-text-muted)" }}>Close</button>
            </div>
            <div className="relative flex items-center justify-center bg-black" style={{ minHeight: "60vh" }}>
              <img src={activeLightboxPhoto.uri} alt={activeLightboxPhoto.label || "Job photo"} className="max-h-[70vh] w-auto max-w-full object-contain" />
              {selectedJobPhotos.length > 1 && (
                <>
                  <button
                    onClick={() => setLightboxIndex((prev) => (prev === null ? 0 : (prev - 1 + selectedJobPhotos.length) % selectedJobPhotos.length))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 px-3 py-2 rounded-full"
                    style={{ background: "rgba(15,23,42,0.65)", color: "#fff" }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setLightboxIndex((prev) => (prev === null ? 0 : (prev + 1) % selectedJobPhotos.length))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-2 rounded-full"
                    style={{ background: "rgba(15,23,42,0.65)", color: "#fff" }}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
