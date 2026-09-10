"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ImagePlus,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  acknowledgmentNotice,
  getServiceTemplate,
} from "@/lib/service-reports/templates";
import { validateReport } from "@/lib/service-reports/domain";
import ChecklistFields from "./ChecklistFields";
import ServiceReportHistory, {
  ReportDelivery,
  ReportRequestError,
  reportButton,
  reportInput,
  reportRequest,
  reportUrl,
  type ReportData,
  type ReportRecord,
} from "./ServiceReportHistory";

type Fuel = ReportData["fuel"];
export type ServiceReportContext = {
  jobId: string;
  jobNumber: string;
  customerId: string;
  customerName: string;
  address: string;
  serviceDate: string;
  equipment: unknown;
  technicianName: string;
  technicianId: string;
  suggestedFuel: Fuel | null;
  email: string;
  canVerifyStorage?: boolean;
};
type ReportList = { reports: ReportRecord[]; context: ServiceReportContext };
type PendingPhoto = {
  file: File;
  slotId: string;
  caption: string;
  blob?: Blob;
  preview?: string;
  revision: number;
  uploadStarted?: boolean;
  error?: string;
};
type Props = {
  jobId: string;
  initialReports?: ReportRecord[];
  initialContext?: ServiceReportContext;
};

export async function compressServicePhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(
          new Error(
            "This photo could not be decoded. HEIC may not be supported on this device. Choose a JPEG/PNG or retake with Camera.",
          ),
        );
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("The photo is empty or unreadable.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Photo compression is unavailable on this device. No photo was uploaded.",
      );
    let dimension = 1800;
    for (let pass = 0; pass < 5; pass++) {
      const scale = Math.min(
        1,
        dimension / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(
                  new Error("Photo compression failed. No photo was uploaded."),
                ),
          "image/jpeg",
          0.82 - pass * 0.1,
        ),
      );
      if (blob.size > 0 && blob.size <= 350_000) return blob;
      dimension = Math.round(dimension * 0.75);
    }
    throw new Error(
      "This photo could not be reduced to 350 KB. Choose a smaller image.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function equipmentText(equipment: unknown): string {
  if (typeof equipment === "string") return equipment;
  if (Array.isArray(equipment))
    return equipment.map(equipmentText).filter(Boolean).join("; ");
  if (equipment && typeof equipment === "object")
    return Object.entries(equipment)
      .filter(([, value]) => typeof value === "string" && value)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" / ");
  return "Not recorded";
}

function prefill(
  report: ReportRecord,
  context: ServiceReportContext | null,
): ReportData {
  if (!context || report.status === "finalized") return report.data;
  const answers = { ...report.data.answers };
  const defaults: Record<string, string> = {
    companyName: "AARON'S FIREPLACE CO, LLC",
    companyContact: "(417) 732-9775 | aaronsfireplaceco@yahoo.com",
    customerName: context.customerName,
    customerContact: context.email,
    serviceAddress: context.address,
    serviceDate: context.serviceDate,
    jobNumber: context.jobNumber,
    makeModel: equipmentText(context.equipment),
  };
  const fieldIds = new Set(
    getServiceTemplate(report.data.fuel).sections.flatMap((section) =>
      section.fields.map((field) => field.id),
    ),
  );
  for (const [id, value] of Object.entries(defaults))
    if (
      fieldIds.has(id) &&
      !answers[id] &&
      value &&
      value !== "Not recorded"
    )
      answers[id] = value;
  answers.technicianName = context.technicianName;
  return { ...report.data, answers };
}

function localChecklist(context: ServiceReportContext, fuel: Fuel): ReportRecord {
  const report: ReportRecord = { id: "", jobId: context.jobId, customerId: context.customerId,
    revision: 0, status: "draft", photos: [], createdAt: "", updatedAt: "",
    data: { fuel, answers: {}, photoExceptions: {}, customerAcknowledgment: "" } };
  return { ...report, data: prefill(report, context) };
}

function SavedPhoto({ src, caption }: { src: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  return (
    <figure className="min-w-0 space-y-1">
      {failed ? (
        <button
          type="button"
          className={`${reportButton} aspect-[4/3] w-full`}
          onClick={() => {
            setFailed(false);
            setVersion((value) => value + 1);
          }}
        >
          <RefreshCw size={16} />
          Retry preview
        </button>
      ) : (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${caption}`}
        >
          {/* Authenticated photo bytes must bypass the public image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${src}?preview=${version}`}
            alt={caption}
            onError={() => setFailed(true)}
            className="aspect-[4/3] w-full rounded-md object-cover"
          />
        </a>
      )}
      <figcaption className="text-xs break-words">
        {caption} <span className="text-[var(--color-success)]">Saved</span>
      </figcaption>
    </figure>
  );
}

export default function ServiceReportEditor({
  jobId,
  initialReports,
  initialContext,
}: Props) {
  const [reports, setReports] = useState<ReportRecord[]>(initialReports || []);
  const [context, setContext] = useState<ServiceReportContext | null>(
    initialContext || null,
  );
  const [selected, setSelected] = useState<ReportRecord | null>(
    initialReports?.[0] || (initialContext?.suggestedFuel ? localChecklist(initialContext, initialContext.suggestedFuel) : null),
  );
  const [data, setData] = useState<ReportData | null>(() =>
    initialReports?.[0]
      ? prefill(initialReports[0], initialContext || null)
      : initialContext?.suggestedFuel ? localChecklist(initialContext, initialContext.suggestedFuel).data : null,
  );
  const [showOptionalPhotos, setShowOptionalPhotos] = useState(false);
  const [edited, setEdited] = useState(false);
  const [loading, setLoading] = useState(!initialContext);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<PendingPhoto | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const lock = useRef(false);
  const target = useRef<{ slotId: string; caption: string } | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const finalizeDialog = useRef<HTMLDialogElement>(null);
  const autoSave = useRef<() => void>(() => {});
  const dirty =
    !!selected &&
    !!data &&
    JSON.stringify(data) !== JSON.stringify(prefill(selected, context));
  const template = data ? getServiceTemplate(data.fuel) : null;
  const finalized = selected?.status === "finalized";
  const missing = data && selected ? validateReport(data, selected.photos) : [];

  useEffect(() => {
    if (initialContext && refresh === 0) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    reportRequest<ReportList>(
      `/api/tech/service-reports?jobId=${encodeURIComponent(jobId)}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setReports(result.reports);
        setContext(result.context);
        const active = result.reports[0] || (result.context.suggestedFuel ? localChecklist(result.context, result.context.suggestedFuel) : null);
        setSelected(active);
        setData(active ? prefill(active, result.context) : null);
        setEdited(false);
        setError("");
        setConflict(false);
        setCreationUncertain(false);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadFailed(true);
          setError(
            error instanceof Error
              ? error.message
              : "Could not load service reports.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [jobId, refresh, initialContext]);

  useEffect(() => { autoSave.current = () => { if (!target.current) void run("Saving...", async () => { await save(); }); }; });
  useEffect(() => {
    const inputs = [camera.current, gallery.current];
    const cancel = () => { target.current = null; setPickerOpen(false); };
    inputs.forEach(input => input?.addEventListener("cancel", cancel));
    return () => inputs.forEach(input => input?.removeEventListener("cancel", cancel));
  }, []);
  useEffect(() => {
    if (!edited || !dirty || busy || pending || pickerOpen || conflict || creationUncertain || loading || loadFailed || error || finalized) return;
    const timer = window.setTimeout(() => autoSave.current(), 1000);
    return () => window.clearTimeout(timer);
  }, [edited, dirty, data, busy, pending, pickerOpen, conflict, creationUncertain, loading, loadFailed, error, finalized]);

  useEffect(() => {
    if (!dirty && !pending && !busy) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.getAttribute("href")?.startsWith("#")
      )
        return;
      if (!window.confirm("Leave with unsaved report work?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, pending, busy]);

  useEffect(() => {
    const preview = pending?.preview;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [pending?.preview]);
  useEffect(() => {
    if (finalizeOpen) finalizeDialog.current?.showModal();
    else finalizeDialog.current?.close();
  }, [finalizeOpen]);

  function applyReport(report: ReportRecord, submitted?: ReportData) {
    if (!report?.id || !Number.isInteger(report.revision))
      throw new Error(
        "Saved report could not be verified. Reload before retrying.",
      );
    setReports((previous) => [
      report,
      ...previous.filter((item) => item.id !== report.id),
    ]);
    setSelected(report);
    setData(current => submitted && JSON.stringify(current) !== JSON.stringify(submitted) ? current : report.data);
    setConflict(false);
  }

  function handleError(error: unknown) {
    if (error instanceof ReportRequestError && error.status === 409) {
      setConflict(true);
      setError(
        "This report changed on the server. Your local entries are still here. Copy any needed entries, then reload the saved version before continuing.",
      );
    } else
      setError(
        error instanceof Error
          ? error.message
          : "The operation failed. Your entries are still here.",
      );
  }

  async function run(label: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (error) {
      handleError(error);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  function choose(report: ReportRecord | null) {
    if (lock.current) return;
    if (
      (dirty || pending) &&
      !window.confirm("Discard unsaved changes and pending photo?")
    )
      return;
    const next = report || (context?.suggestedFuel ? localChecklist(context, context.suggestedFuel) : null);
    setSelected(next);
    setData(next ? prefill(next, context) : null);
    setEdited(false);
    setPending(null);
    setCaptions({});
    setError("");
    setNotice("");
    setConflict(false);
  }

  function reload() {
    if (lock.current) return;
    if (
      (dirty || pending) &&
      !window.confirm("Discard local changes and reload the saved reports?")
    )
      return;
    setPending(null);
    setRefresh((value) => value + 1);
  }

  function selectFuel(fuel: Fuel) {
    if (!context || lock.current || pending || creationUncertain) return;
    if (dirty && !window.confirm("Change appliance type and discard these unsaved checklist entries?")) return;
    const next = localChecklist(context, fuel);
    setSelected(next);
    setData(next.data);
    setEdited(false);
    setError("");
  }

  async function checkStorage() {
    if (!context?.canVerifyStorage || loading) return;
    await run("Checking report file connection...", async () => {
      try {
        const result = await reportRequest<{
          upload: boolean;
          download: boolean;
          integrity: boolean;
          syntheticObjectRemoved: boolean;
        }>("/api/tech/service-reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check-storage" }),
        });
        if (
          result.upload !== true ||
          result.download !== true ||
          result.integrity !== true ||
          result.syntheticObjectRemoved !== true
        ) {
          throw new Error(
            "The server did not confirm every storage check and cleanup.",
          );
        }
        setNotice("Private report storage verified");
      } catch (error) {
        throw new Error(
          `Report file connection check failed: ${error instanceof Error ? error.message : "Storage could not be verified."}`,
        );
      }
    });
  }

  async function save(): Promise<ReportRecord> {
    if (!selected || !data) throw new Error("Select a report first.");
    if (creationUncertain) throw new Error("Reload the saved checklist before trying to save again.");
    const submitted = data;
    let base = selected;
    if (!base.id) {
      try {
        const result = await reportRequest<{ report: ReportRecord }>("/api/tech/service-reports", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, fuel: submitted.fuel }),
        });
        if (!result.report?.id || !Number.isInteger(result.report.revision)) throw new Error("Checklist creation could not be confirmed. Reload before retrying.");
        base = result.report;
        setSelected(base);
        setReports(previous => [base, ...previous.filter(item => item.id !== base.id)]);
      } catch (error) {
        if (!(error instanceof ReportRequestError) || error.status >= 500) setCreationUncertain(true);
        throw error;
      }
    }
    if (JSON.stringify(submitted) === JSON.stringify(base.data)) return base;
    const result = await reportRequest<{ report: ReportRecord }>(
      "/api/tech/service-reports",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: base.id,
          revision: base.revision,
          data: submitted,
        }),
      },
    );
    applyReport(result.report, submitted);
    return result.report;
  }

  function pickPhoto(slotId: string, useCamera: boolean) {
    if (
      lock.current ||
      pending ||
      finalized ||
      conflict ||
      !selected ||
      selected.photos.length >= 30
    )
      return;
    target.current = {
      slotId,
      caption:
        captions[slotId]?.trim() ||
        template?.photoSlots.find((slot) => slot.id === slotId)?.label ||
        slotId,
    };
    setPickerOpen(true);
    (useCamera ? camera : gallery).current?.click();
  }

  async function upload(photo: PendingPhoto) {
    if (!selected || finalized || conflict) return;
    await run("Preparing photo...", async () => {
      let prepared = photo;
      try {
        const blob = photo.blob || (await compressServicePhoto(photo.file));
        prepared = {
          ...photo,
          blob,
          preview: photo.preview || URL.createObjectURL(blob),
          error: undefined,
        };
        setPending(prepared);
        // Save answers before uploading; the returned revision owns this upload attempt.
        const saved = photo.uploadStarted ? selected : await save();
        prepared = {
          ...prepared,
          revision: photo.uploadStarted ? photo.revision : saved.revision,
          uploadStarted: true,
        };
        setPending(prepared);
        setBusy("Uploading photo...");
        const form = new FormData();
        form.set("file", blob, "service-photo.jpg");
        form.set("slotId", photo.slotId);
        form.set("caption", photo.caption);
        form.set("revision", String(prepared.revision));
        const result = await reportRequest<{ report: ReportRecord }>(
          `${reportUrl(saved.id)}/photos`,
          { method: "POST", body: form },
        );
        if (
          !result.report?.photos.some(
            (item) =>
              item.slotId === photo.slotId &&
              !saved.photos.some((old) => old.id === item.id),
          )
        )
          throw new Error(
            "Photo storage was not confirmed. Reload the saved report before retrying.",
          );
        applyReport(result.report);
        setPending(null);
        setNotice("Photo saved.");
      } catch (error) {
        setPending({
          ...prepared,
          error:
            error instanceof Error ? error.message : "Photo upload failed.",
        });
        throw error;
      }
    });
  }

  function photoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    const destination = target.current;
    target.current = null;
    setPickerOpen(false);
    if (!file || !destination || !selected || lock.current) return;
    const photo = { file, ...destination, revision: selected.revision };
    setPending(photo);
    void upload(photo);
  }

  async function removePhoto(photoId: string) {
    if (!selected || finalized || pending || conflict || lock.current) return;
    if (
      !window.confirm(
        "Remove this photo from the draft report? The stored original is retained.",
      )
    )
      return;
    await run("Removing photo...", async () => {
      const saved = await save();
      const result = await reportRequest<{ report: ReportRecord }>(
        `${reportUrl(saved.id)}/photos/${encodeURIComponent(photoId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: saved.revision }),
        },
      );
      applyReport(result.report);
      setNotice(
        "Photo removed from draft. Camera and Gallery are available for a retake.",
      );
    });
  }

  const readOnly =
    (!!busy && busy !== "Saving...") || !!finalized || conflict || creationUncertain || !!pending || loading || loadFailed;

  return (
    <section
      className="mx-auto min-w-0 max-w-3xl space-y-4 text-[var(--color-text-primary)]"
      aria-label="Service report editor"
    >
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={photoSelected}
        disabled={readOnly}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={photoSelected}
        disabled={readOnly}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{template?.title || "Service"} Checklist</h2>
        <div className="flex gap-2">
          {context?.canVerifyStorage && (
            <button
              type="button"
              className={reportButton}
              title="Check report file connection"
              aria-label="Check report file connection"
              onClick={() => void checkStorage()}
              disabled={!!busy || loading}
            >
              <Wrench size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={reportButton}
            title="Reload saved reports"
            aria-label="Reload saved reports"
            onClick={reload}
            disabled={!!busy || loading}
          >
            <RefreshCw size={16} />
          </button>
          {selected?.id && (
            <button
              type="button"
              className={reportButton}
              onClick={() => choose(null)}
              disabled={!!busy || loading}
            >
              <Plus size={16} />
                New checklist
            </button>
          )}
        </div>
      </div>
      {context && (
        <details className="border-b border-[var(--color-border)] pb-2">
          <summary className="cursor-pointer py-2 text-sm text-[var(--color-text-muted)]">{context.technicianName} · {context.serviceDate} · Job details</summary>
        <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 border-y border-[var(--color-border)] py-3 text-sm sm:grid-cols-2">
          {[
            ["Customer", context.customerName],
            ["Job", context.jobNumber],
            ["Service address", context.address],
            ["Service date", context.serviceDate],
            ["Equipment", equipmentText(context.equipment)],
            ["Signed-in technician", context.technicianName],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-[var(--color-text-muted)]">
                {label}
              </dt>
              <dd className="break-words">{value || "Not recorded"}</dd>
            </div>
          ))}
        </dl>
        </details>
      )}
      {loading && <p role="status">Loading service reports...</p>}
      {error && (
        <p
          role="alert"
          className="break-words text-sm text-[var(--color-danger)]"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {creationUncertain && (
        <p role="alert" className="text-sm">
          Draft creation is unconfirmed. Reload saved reports before creating
          another draft.
        </p>
      )}
      {!selected?.id && !loading && !loadFailed && context && (
        <div className="space-y-3 border-b border-[var(--color-border)] pb-4">
          <fieldset disabled={!!busy || creationUncertain}>
            <legend className="mb-2 text-sm font-semibold">
              Appliance type
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {(["gas", "wood", "pellet"] as const).map((value) => (
                <label
                  key={value}
                  className={`${reportButton} cursor-pointer capitalize ${data?.fuel === value ? "bg-[var(--color-surface-3)]" : ""}`}
                >
                  <input
                    type="radio"
                    name={`fuel-${jobId}`}
                    value={value}
                    checked={data?.fuel === value}
                    onChange={() => selectFuel(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
      {selected && data && template && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
            <div>
              <h3 className="text-base font-semibold">{template.sections.flatMap(section => section.fields).filter(field => field.type === "condition" && data.answers[field.id]).length}/{template.sections.flatMap(section => section.fields).filter(field => field.type === "condition").length} checks recorded</h3>
              <p role="status" className="text-sm">
                {busy ||
                  (finalized
                    ? `Finalized / revision ${selected.revision}`
                    : dirty
                      ? "Unsaved changes"
                      : selected.id ? "All changes saved" : "Ready")}
              </p>
            </div>
            {!finalized && (
              <button
                type="button"
                className={reportButton}
                disabled={readOnly || !!busy || !dirty}
                onClick={() =>
                  void run("Saving...", async () => {
                    await save();
                    setNotice("Report saved.");
                  })
                }
              >
                <Save size={16} />
                Save
              </button>
            )}
          </div>
          <ChecklistFields key={data.fuel} template={template} data={data} disabled={readOnly}
            onChange={(id, value) => { setEdited(true); setData(current => current ? { ...current, answers: { ...current.answers, [id]: value } } : current); }} />
          <section className="space-y-4" aria-label="Report photos">
            <h3 className="text-base font-semibold">
              Report photos{" "}
              <span className="text-sm font-normal">
                {selected.photos.length} / 30
              </span>
            </h3>
            {selected.photos.length >= 30 && !finalized && (
              <p role="status" className="text-sm">
                Photo limit reached. Remove a draft photo before taking a
                replacement.
              </p>
            )}
            {template.photoSlots.filter(slot => slot.required || data.answers[slot.id] === "D" || selected.photos.some(photo => photo.slotId === slot.id) || data.photoExceptions[slot.id] || (showOptionalPhotos && !/^[GWP]\d+$/.test(slot.id))).map((slot) => (
              <div
                key={slot.id}
                className="min-w-0 space-y-3 border-b border-[var(--color-border)] pb-4"
              >
                <h4 className="text-sm font-semibold">
                  {slot.label}{" "}
                  <span className="font-normal text-[var(--color-text-muted)]">
                    {slot.required || data.answers[slot.id] === "D"
                      ? "Required"
                      : "Optional"}
                  </span>
                </h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selected.photos
                    .filter((photo) => photo.slotId === slot.id)
                    .map((photo) => (
                      <div key={photo.id} className="min-w-0 space-y-2">
                        <SavedPhoto
                          src={`${reportUrl(selected.id)}/photos/${encodeURIComponent(photo.id)}`}
                          caption={photo.caption || slot.label}
                        />
                        {!finalized && (
                          <button
                            type="button"
                            className={reportButton}
                            disabled={readOnly}
                            title="Remove photo from draft"
                            aria-label={`Remove ${photo.caption || slot.label}`}
                            onClick={() => void removePhoto(photo.id)}
                          >
                            <Trash2 size={16} />
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                </div>
                {!finalized && (
                  <>
                    <details><summary className="cursor-pointer py-2 text-xs text-[var(--color-text-muted)]">Add caption</summary><label className="block text-sm">
                      Caption
                      <input
                        className={`${reportInput} mt-1`}
                        value={captions[slot.id] || ""}
                        maxLength={500}
                        disabled={readOnly}
                        onChange={(event) =>
                          setCaptions((previous) => ({
                            ...previous,
                            [slot.id]: event.target.value,
                          }))
                        }
                      />
                    </label></details>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={reportButton}
                        disabled={readOnly || !!busy || selected.photos.length >= 30}
                        onClick={() => pickPhoto(slot.id, true)}
                        aria-label={`Camera: ${slot.label}`}
                      >
                        <Camera size={16} />
                        Camera
                      </button>
                      <button
                        type="button"
                        className={reportButton}
                        disabled={readOnly || !!busy || selected.photos.length >= 30}
                        onClick={() => pickPhoto(slot.id, false)}
                        aria-label={`Gallery: ${slot.label}`}
                      >
                        <ImagePlus size={16} />
                        Gallery
                      </button>
                    </div>
                  </>
                )}
                <details open={data.photoExceptions[slot.id] ? true : undefined}><summary className="cursor-pointer py-2 text-xs text-[var(--color-text-muted)]">Unable to take this photo?</summary><label className="block text-sm">
                  Exception reason (at least 10 characters when provided)
                  <textarea
                    className={`${reportInput} mt-1`}
                    maxLength={8000}
                    disabled={readOnly}
                    value={data.photoExceptions[slot.id] || ""}
                    onChange={(event) => {
                      const photoExceptions = { ...data.photoExceptions };
                      if (event.target.value)
                        photoExceptions[slot.id] = event.target.value;
                      else delete photoExceptions[slot.id];
                      setData({ ...data, photoExceptions });
                      setEdited(true);
                    }}
                  />
                </label></details>
                {pending?.slotId === slot.id && (
                  <div className="space-y-2" role="status">
                    {pending.preview && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pending.preview}
                          alt="Local photo, not confirmed saved"
                          className="aspect-[4/3] w-40 max-w-full rounded-md object-cover"
                        />
                      </>
                    )}
                    <p className="text-sm">{busy || "Not confirmed saved"}</p>
                    {pending.error && (
                      <p className="text-sm break-words text-[var(--color-danger)]">
                        {pending.error}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={reportButton}
                        disabled={!!busy || conflict}
                        onClick={() => void upload(pending)}
                      >
                        <RefreshCw size={16} />
                        Retry upload
                      </button>
                      <button
                        type="button"
                        className={reportButton}
                        disabled={!!busy}
                        onClick={() => setPending(null)}
                      >
                        <X size={16} />
                        Dismiss local photo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!finalized && <button type="button" className={reportButton} onClick={() => setShowOptionalPhotos(value => !value)}>{showOptionalPhotos ? "Hide additional photos" : "Additional photos"}</button>}
          </section>
          <details><summary className="cursor-pointer py-2 text-sm text-[var(--color-text-muted)]">Report scope and acknowledgment</summary><p className="text-sm text-[var(--color-text-secondary)]">
            {acknowledgmentNotice}
          </p></details>
          <label className="block text-sm">
            Customer acknowledgment: receipt, or unavailable / declined with
            reason
            <textarea
              className={`${reportInput} mt-1 min-h-24`}
              aria-required="true"
              maxLength={4000}
              disabled={readOnly}
              value={data.customerAcknowledgment}
              onChange={(event) =>
                { setEdited(true); setData({ ...data, customerAcknowledgment: event.target.value }); }
              }
            />
          </label>
          {!finalized && (
            <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
              {missing.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    {missing.length} required entries remaining
                  </summary>
                  <ul className="list-disc space-y-1 pl-5 pt-2 text-sm">
                    {missing.map((label, index) => (
                      <li key={`${index}-${label}`} className="break-words">
                        {label}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <button
                type="button"
                className={reportButton}
                disabled={
                  readOnly ||
                  missing.length > 0 ||
                  !context?.technicianName ||
                  !context?.technicianId
                }
                onClick={() => setFinalizeOpen(true)}
              >
                <Check size={16} />
                Generate PDF
              </button>
            </div>
          )}
          {finalized && (
            <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
              <p className="text-sm">
                Electronic signature:{" "}
                <strong>{selected.technicianName || "Not recorded"}</strong>
                {selected.finalizedAt &&
                  ` / ${new Date(selected.finalizedAt).toLocaleString()}`}
              </p>
              <ReportDelivery
                key={selected.id}
                report={selected}
                email={context?.email}
                onChange={applyReport}
              />
            </div>
          )}
        </>
      )}
      <ServiceReportHistory
        reports={reports}
        selectedId={selected?.id}
        onSelect={choose}
        disabled={!!busy || loading}
      />
      <dialog
        ref={finalizeDialog}
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setFinalizeOpen(false);
        }}
        onClose={() => setFinalizeOpen(false)}
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-[var(--color-text-primary)] backdrop:bg-black/60"
      >
        <div className="space-y-4">
          <h3 className="text-base font-semibold">Generate service report?</h3>
          <p className="text-sm">
            I, <strong>{context?.technicianName}</strong>, confirm this report
            is accurate and authorize my electronic signature. Finalization
            locks this report. It does not complete the job or send email.
          </p>
          <p className="text-sm">
            {context?.customerName} / {context?.jobNumber} / {template?.title}
          </p>
          {error && (
            <p
              role="alert"
              className="text-sm break-words text-[var(--color-danger)]"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={reportButton}
              disabled={!!busy || conflict}
              onClick={() =>
                void run("Finalizing...", async () => {
                  const saved = await save();
                  const result = await reportRequest<{ report: ReportRecord }>(
                    "/api/tech/service-reports",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "finalize",
                        id: saved.id,
                        revision: saved.revision,
                      }),
                    },
                  );
                  if (result.report?.status !== "finalized")
                    throw new Error(
                      "Finalization was not confirmed. Reload the saved report before retrying.",
                    );
                  applyReport(result.report);
                  setFinalizeOpen(false);
                  setNotice("Report finalized. Job status unchanged.");
                })
              }
            >
              <Check size={16} />
              {busy || "Confirm and generate PDF"}
            </button>
            <button
              type="button"
              className={reportButton}
              disabled={!!busy}
              onClick={() => setFinalizeOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
