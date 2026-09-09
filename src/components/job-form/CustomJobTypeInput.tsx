import { MAX_CUSTOM_JOB_TYPE_LENGTH } from "./job-form-helpers";

export default function CustomJobTypeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs sm:col-span-2">
    Custom job type
    <input aria-label="Custom job type" required maxLength={MAX_CUSTOM_JOB_TYPE_LENGTH} value={value} onChange={(event) => onChange(event.target.value)} className="w-full min-w-0 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
  </label>;
}
