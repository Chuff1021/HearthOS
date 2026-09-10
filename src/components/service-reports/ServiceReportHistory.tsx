"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Mail, RefreshCw, Send, X } from "lucide-react";
import { getServiceTemplate } from "@/lib/service-reports/templates";
import type { ReportData, Photo } from "@/lib/service-reports/domain";

export type { ReportData } from "@/lib/service-reports/domain";
export type ReportRecord = {
  id: string;
  jobId: string;
  customerId: string;
  revision: number;
  status: "draft" | "finalized";
  data: ReportData;
  photos: Photo[];
  finalizedAt?: string;
  technicianName?: string;
  createdAt: string;
  updatedAt: string;
  emailStatus?: string;
};

export const reportButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";
export const reportInput =
  "block w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 text-base text-[var(--color-text-primary)]";
export const reportUrl = (id: string) =>
  `/api/tech/service-reports/${encodeURIComponent(id)}`;

export class ReportRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function reportRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const details = Array.isArray(body?.errors)
      ? body.errors
          .filter((value: unknown) => typeof value === "string")
          .join("; ")
      : "";
    throw new ReportRequestError(
      [
        typeof body?.error === "string"
          ? body.error
          : `Request failed (${response.status})`,
        details,
      ]
        .filter(Boolean)
        .join(": "),
      response.status,
    );
  }
  if (!body)
    throw new Error(
      "The server response could not be verified. Check the saved report before retrying.",
    );
  return body as T;
}

export function ReportDelivery({
  report,
  email = "",
  onChange,
}: {
  report: ReportRecord;
  email?: string;
  onChange?: (report: ReportRecord) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [recipient, setRecipient] = useState(email);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const attempt = useRef<{ actionId: string; email: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (confirm) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirm]);

  async function send() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const currentAttempt = attempt.current || {
      actionId: crypto.randomUUID(),
      email: recipient.trim(),
    };
    attempt.current = currentAttempt;
    try {
      const result = await reportRequest<{
        status: "accepted" | "sending" | "uncertain" | "failed";
      }>("/api/tech/service-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "email",
          id: report.id,
          ...currentAttempt,
        }),
      });
      const status = result.status;
      onChange?.({ ...report, emailStatus: status });
      const isFailure = status === "failed";
      const isUnknown = status !== "accepted" && status !== "failed";
      setFailed(isFailure || isUnknown);
      setUncertain(isUnknown);
      setMessage(
        isFailure
          ? "Email failed. The finalized report is saved. Confirm the recipient before retrying."
          : status === "sending"
            ? "Email is sending. Acceptance is not yet confirmed. Check the same attempt before sending again."
            : isUnknown
              ? "Email outcome is uncertain. Ask the office to verify before sending again."
              : "Email accepted by the provider. Inbox delivery is not confirmed.",
      );
      if (!isUnknown) {
        attempt.current = null;
        setConfirm(false);
      }
    } catch (error) {
      const knownFailure =
        error instanceof ReportRequestError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 409;
      setFailed(true);
      setUncertain(!knownFailure);
      if (knownFailure) attempt.current = null;
      setMessage(
        `${error instanceof Error ? error.message : "Email failed."} The finalized report is saved.${knownFailure ? "" : " Retry checks the same email attempt, not a new send."}`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (report.status !== "finalized") return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          className={reportButton}
          href={`${reportUrl(report.id)}/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          <Download size={16} aria-hidden="true" />
          View saved PDF
        </a>
        <button
          type="button"
          className={reportButton}
          onClick={() => {
            if (!attempt.current) setRecipient(email);
            setConfirm(true);
          }}
        >
          <Mail size={16} aria-hidden="true" />
          {uncertain ? "Check email attempt" : "Email report"}
        </button>
      </div>
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className="text-sm break-words"
          style={{
            color: failed
              ? "var(--color-danger)"
              : "var(--color-text-secondary)",
          }}
        >
          {message}
        </p>
      )}
      <dialog
        ref={dialog}
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setConfirm(false);
        }}
        onClose={() => setConfirm(false)}
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-[var(--color-text-primary)] backdrop:bg-black/60"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">
              Confirm report recipient
            </h3>
            <button
              type="button"
              disabled={busy}
              className={reportButton}
              aria-label="Close email confirmation"
              title="Close"
              onClick={() => setConfirm(false)}
            >
              <X size={16} />
            </button>
          </div>
          <label className="block text-sm">
            Recipient
            <input
              type="email"
              required
              value={recipient}
              disabled={busy || uncertain}
              onChange={(event) => setRecipient(event.target.value)}
              className={`${reportInput} mt-1`}
              autoComplete="email"
            />
          </label>
          <p className="text-sm">
            Attachment: finalized {report.data.fuel} service report, revision{" "}
            {report.revision}.
          </p>
          {message && (
            <p role="status" className="text-sm break-words">
              {message}
            </p>
          )}
          <button
            className={`${reportButton} w-full`}
            disabled={busy || !recipient.trim()}
          >
            <Send size={16} aria-hidden="true" />
            {busy
              ? "Checking email..."
              : uncertain
                ? "Check same attempt"
                : "Confirm and send"}
          </button>
        </form>
      </dialog>
    </div>
  );
}

type Props = {
  customerId?: string;
  reports?: ReportRecord[];
  email?: string;
  selectedId?: string;
  disabled?: boolean;
  onSelect?: (report: ReportRecord) => void;
  onChange?: (report: ReportRecord) => void;
};

export default function ServiceReportHistory({
  customerId,
  reports: supplied,
  email,
  selectedId,
  disabled,
  onSelect,
  onChange,
}: Props) {
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(!supplied);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (supplied || !customerId) return;
    const controller = new AbortController();
    reportRequest<{ reports: ReportRecord[] }>(
      `/api/tech/service-reports?customerId=${encodeURIComponent(customerId)}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setRecords(result.reports);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Could not load reports.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [customerId, supplied, refresh]);
  const reports = supplied || records;
  function update(report: ReportRecord) {
    setRecords((previous) =>
      previous.map((item) => (item.id === report.id ? report : item)),
    );
    onChange?.(report);
  }

  return (
    <section
      className="min-w-0 space-y-3 border-t border-[var(--color-border)] py-4"
      aria-label="Service Reports"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Service Reports</h2>
        {customerId && (
          <button
            type="button"
            className={reportButton}
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setError("");
              setRefresh((value) => value + 1);
            }}
            aria-label="Refresh service reports"
            title="Refresh service reports"
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>
      {loading && (
        <p role="status" className="text-sm">
          Loading reports...
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {!loading && !error && reports.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)]">
          No service reports yet.
        </p>
      )}
      {!error &&
        reports.map((report) => (
          <article
            key={report.id}
            className="min-w-0 space-y-3 border-b border-[var(--color-border)] pb-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold break-words">
                  {getServiceTemplate(report.data.fuel).title}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Revision {report.revision} / {report.status} /{" "}
                  {new Date(report.updatedAt).toLocaleString()}
                </p>
                <p className="text-sm break-words">
                  {report.technicianName || "Not finalized"}
                </p>
                <p className="text-xs break-words">
                  Email: {report.emailStatus || "Not sent"}
                </p>
              </div>
              {onSelect && (
                <button
                  type="button"
                  disabled={disabled}
                  className={reportButton}
                  aria-pressed={selectedId === report.id}
                  onClick={() => onSelect(report)}
                >
                  {report.status === "draft" ? "Open draft" : "View report"}
                </button>
              )}
            </div>
            {Object.entries(report.data.photoExceptions)
              .filter(([, reason]) => reason.trim())
              .map(([slot, reason]) => (
                <p key={slot} className="text-sm break-words">
                  <strong>
                    {getServiceTemplate(report.data.fuel).photoSlots.find(
                      (item) => item.id === slot,
                    )?.label || slot}
                    :
                  </strong>{" "}
                  {reason}
                </p>
              ))}
            {!onSelect && (
              <>
                <details>
                  <summary className="cursor-pointer text-sm">
                    Recorded findings and photos
                  </summary>
                  <div className="mt-3 space-y-3">
                    {getServiceTemplate(report.data.fuel).sections.map(
                      (section) => (
                        <section key={section.id}>
                          <h4 className="text-sm font-semibold">
                            {section.title}
                          </h4>
                          <dl className="mt-2 space-y-2">
                            {section.fields.map((field) => (
                              <div key={field.id} className="text-sm">
                                <dt className="text-[var(--color-text-muted)]">
                                  {field.label}
                                </dt>
                                <dd className="whitespace-pre-wrap break-words">
                                  {report.data.answers[field.id] ||
                                    "Not recorded"}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      ),
                    )}
                    <p className="text-sm">
                      Customer acknowledgment:{" "}
                      {report.data.customerAcknowledgment || "Not recorded"}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {report.photos.map((photo) => (
                        <a
                          key={photo.id}
                          href={`${reportUrl(report.id)}/photos/${encodeURIComponent(photo.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 text-sm underline"
                        >
                          {photo.caption ||
                            getServiceTemplate(
                              report.data.fuel,
                            ).photoSlots.find(
                              (slot) => slot.id === photo.slotId,
                            )?.label ||
                            "View photo"}
                        </a>
                      ))}
                    </div>
                  </div>
                </details>
                <ReportDelivery
                  key={report.id}
                  report={report}
                  email={email}
                  onChange={update}
                />
              </>
            )}
          </article>
        ))}
    </section>
  );
}
