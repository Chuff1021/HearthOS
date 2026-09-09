"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, X } from "lucide-react";

const fields = [
  { name: "displayName", label: "Display name", max: 100, autoComplete: "off" },
  { name: "firstName", label: "First name", max: 100, autoComplete: "given-name" },
  { name: "lastName", label: "Last name", max: 100, autoComplete: "family-name" },
  { name: "companyName", label: "Company", max: 255, autoComplete: "organization" },
  { name: "email", label: "Email", max: 255, autoComplete: "email" },
  { name: "phone", label: "Phone", max: 50, autoComplete: "tel" },
  { name: "line1", label: "Address line 1", max: 500, autoComplete: "address-line1" },
  { name: "line2", label: "Address line 2", max: 500, autoComplete: "address-line2" },
  { name: "city", label: "City", max: 100, autoComplete: "address-level2" },
  { name: "state", label: "State", max: 50, autoComplete: "address-level1" },
  { name: "zip", label: "ZIP / postal code", max: 20, autoComplete: "postal-code" },
] as const;
type Field = typeof fields[number]["name"];
type Values = Record<Field, string>;
type Payload = Pick<Values, "displayName" | "firstName" | "lastName" | "companyName" | "email" | "phone"> & {
  address: Pick<Values, "line1" | "line2" | "city" | "state" | "zip">;
};
export type CreatedCustomer = { id: string; localId: string; displayName?: string };
const emptyValues: Values = { displayName: "", firstName: "", lastName: "", companyName: "", email: "", phone: "", line1: "", line2: "", city: "", state: "", zip: "" };
const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500";
const unknownMessage = "Creation is not confirmed. Check creation status before creating this customer again.";

export default function CreateCustomerDialog({ onCreated }: { onCreated: (customer: CreatedCustomer) => void }) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  // Keep the exact submitted values through close/reopen and ambiguous responses.
  const submittedRef = useRef<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(emptyValues);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [phase, setPhase] = useState<"editable" | "pending" | "review" | "success">("editable");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [customer, setCustomer] = useState<CreatedCustomer | null>(null);
  const locked = phase !== "editable";

  function showDialog() {
    dialogRef.current?.showModal();
    if (!locked) dialogRef.current?.querySelector<HTMLInputElement>('[name="displayName"]')?.focus();
    setOpen(true);
  }

  function closeDialog() {
    // Only clear confirmed creation after the user dismisses its visible result.
    if (phase === "success") {
      submittedRef.current = null;
      setValues(emptyValues);
      setErrors({});
      setCustomer(null);
      setMessage("");
      setPhase("editable");
    }
    dialogRef.current?.close();
  }

  async function submit(reconcile = false) {
    if (pendingRef.current || phase === "success") return;
    if (reconcile ? !submittedRef.current : submittedRef.current !== null) return;
    let payload = submittedRef.current;
    if (!reconcile) {
      const nextErrors: Partial<Record<Field, string>> = {};
      for (const field of fields) {
        if (values[field.name].trim().length > field.max) nextErrors[field.name] = `Use ${field.max} characters or fewer.`;
        if (/[\u0000-\u001f]/.test(values[field.name])) nextErrors[field.name] = "Remove control characters.";
      }
      if (!values.displayName.trim()) nextErrors.displayName = "Enter a display name.";
      if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) nextErrors.email = "Enter a valid email address.";
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        const first = fields.find(field => nextErrors[field.name]);
        dialogRef.current?.querySelector<HTMLInputElement>(`[name="${first?.name}"]`)?.focus();
        return;
      }
      const clean = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])) as Values;
      const { line1, line2, city, state, zip, ...contact } = clean;
      payload = { ...contact, address: { line1, line2, city, state, zip } };
      submittedRef.current = payload;
    }
    pendingRef.current = true;
    setChecking(reconcile);
    setPhase("pending");
    setMessage(reconcile ? "Checking creation status..." : "Creating customer...");
    let confirmed: CreatedCustomer | null = null;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Bound both headers and body reads, even if a transport ignores abort.
      const { response, result } = await Promise.race([
        (async () => {
          const response = await fetch("/api/quickbooks/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reconcile ? { ...payload, action: "reconcile" } : payload),
            signal: controller.signal,
          });
          const result = await response.json().catch((error: unknown) => {
            if (response.status === 401 || response.status === 403) return null;
            throw error;
          });
          return { response, result };
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error("Customer request timed out"));
          }, 20_000);
        }),
      ]);
      const preclaimRejection = response.status === 401 || response.status === 403 ||
        (response.status === 409 && result?.code === "QB_NOT_CONNECTED");
      if ((response.status === 201 || response.status === 200) && result?.success === true &&
        typeof result.customer?.id === "string" && result.customer.id.trim() &&
        typeof result.customer?.localId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.customer.localId)) {
        confirmed = { id: result.customer.id, localId: result.customer.localId,
          displayName: typeof result.customer.displayName === "string" ? result.customer.displayName : payload?.displayName };
        setCustomer(confirmed);
        setPhase("success");
        setMessage(result.recovered === true ? "Customer creation confirmed." : "Customer created.");
      } else if (!reconcile && (preclaimRejection || (response.status === 400 && result?.code !== "CUSTOMER_CREATE_REVIEW_REQUIRED"))) {
        // A rejected status check cannot disprove an earlier ambiguous create.
        submittedRef.current = null;
        setPhase("editable");
        setMessage(typeof result?.error === "string" ? result.error : preclaimRejection
          ? "Customer was not created. Check your access and QuickBooks connection before trying again."
          : "Check the customer details and try again.");
      } else {
        setPhase("review");
        setMessage(typeof result?.error === "string" ? `${result.error} ${unknownMessage}` : unknownMessage);
      }
    } catch {
      setPhase("review");
      setMessage(unknownMessage);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      pendingRef.current = false;
    }
    if (confirmed) onCreated(confirmed);
  }

  return (
    <>
      <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-controls={id} aria-expanded={open}
        className={`ui-btn-primary inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${focusClass}`} onClick={showDialog}>
        <Plus size={16} aria-hidden="true" />New customer
      </button>
      <dialog ref={dialogRef} id={id} aria-labelledby={`${id}-title`} aria-modal="true"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border p-0 backdrop:bg-black/50"
        style={{ background: "var(--color-bg)", color: "var(--color-text-primary)", borderColor: "var(--color-border)" }}
        onCancel={(event) => { event.preventDefault(); closeDialog(); }}
        onClose={() => { setOpen(false); triggerRef.current?.focus(); }}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
          <h2 id={`${id}-title`} className="text-lg font-semibold">New customer</h2>
          <button type="button" aria-label="Close new customer" title="Close new customer"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${focusClass}`} onClick={closeDialog}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <form noValidate className="space-y-4 p-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          {message && <p role={phase === "review" || phase === "editable" ? "alert" : "status"} className="break-words text-sm [overflow-wrap:anywhere]">{message}</p>}
          {customer ? (
            <Link href={`/customers/${encodeURIComponent(customer.localId)}`} className={`inline-block max-w-full break-words underline [overflow-wrap:anywhere] ${focusClass}`}>
              View customer: {customer.displayName || values.displayName}
            </Link>
          ) : (
            <fieldset disabled={locked} aria-busy={phase === "pending"} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 disabled:opacity-70">
              <legend className="sr-only">Customer details</legend>
              {fields.map(field => (
                <div key={field.name} className={`min-w-0 ${field.name === "displayName" || field.name === "line1" || field.name === "line2" ? "sm:col-span-2" : ""}`}>
                  <label htmlFor={`${id}-${field.name}`} className="mb-1 block text-sm font-medium">{field.label}{field.name === "displayName" ? " (required)" : ""}</label>
                  <input id={`${id}-${field.name}`} name={field.name} value={values[field.name]}
                    type={field.name === "email" ? "email" : field.name === "phone" ? "tel" : "text"}
                    required={field.name === "displayName"} maxLength={field.max} autoComplete={field.autoComplete}
                    aria-invalid={!!errors[field.name]} aria-describedby={errors[field.name] ? `${id}-${field.name}-error` : undefined}
                    className="ui-input w-full min-w-0 rounded-lg border px-3 py-2 text-base sm:text-sm"
                    onChange={(event) => {
                      if (pendingRef.current || submittedRef.current) return;
                      setValues(current => ({ ...current, [field.name]: event.target.value }));
                      setErrors(current => ({ ...current, [field.name]: undefined }));
                    }} />
                  {errors[field.name] && <p id={`${id}-${field.name}-error`} className="mt-1 text-sm" role="alert">{errors[field.name]}</p>}
                </div>
              ))}
            </fieldset>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
            <button type="button" className="ui-btn-secondary rounded-lg px-3 py-2 text-sm" onClick={closeDialog}>Close</button>
            {phase === "review" || (phase === "pending" && checking) ? (
              <button type="button" disabled={phase === "pending"} className="ui-btn-primary inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm disabled:opacity-60" onClick={() => void submit(true)}>
                <RefreshCw size={16} aria-hidden="true" className={phase === "pending" ? "animate-spin" : ""} />
                {phase === "pending" ? "Checking creation status..." : "Check creation status"}
              </button>
            ) : phase !== "success" ? (
              <button type="submit" disabled={phase === "pending"} className="ui-btn-primary rounded-lg px-3 py-2 text-sm disabled:opacity-60">
                {phase === "pending" ? "Creating customer..." : "Create customer"}
              </button>
            ) : null}
          </div>
        </form>
      </dialog>
    </>
  );
}
