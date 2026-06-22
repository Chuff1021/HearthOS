import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type PanelProps = ComponentPropsWithoutRef<"div"> & {
  strong?: boolean;
};

export function LiquidPanel({ className = "", strong, ...props }: PanelProps) {
  return (
    <div
      className={`${strong ? "liquid-panel liquid-panel-strong" : "liquid-panel"} ${className}`}
      {...props}
    />
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  sublabel?: string;
  accent?: string;
  href?: string;
  icon?: ReactNode;
};

export function MetricCard({ label, value, sublabel, accent = "var(--color-ember)", href, icon }: MetricCardProps) {
  const body = (
    <LiquidPanel className="group block min-h-[150px] p-5 hover:-translate-y-0.5" strong>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-text-muted)" }}>
            {label}
          </p>
          <p className="mono-number mt-4 text-[2rem] font-semibold leading-none" style={{ color: accent }}>
            {value}
          </p>
          {sublabel && (
            <p className="mt-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
              {sublabel}
            </p>
          )}
        </div>
        {icon && (
          <span
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.68)",
              border: "1px solid rgba(255,255,255,0.86)",
              color: accent,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
            }}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-5 h-9 overflow-hidden rounded-full">
        <div
          className="h-full w-full opacity-80"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent}33, transparent), radial-gradient(circle at 72% 50%, ${accent}44, transparent 28%)`,
          }}
        />
      </div>
    </LiquidPanel>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block">
      {body}
    </Link>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const color =
    tone === "success"
      ? "var(--color-success)"
      : tone === "warning"
        ? "var(--color-warning)"
        : tone === "danger"
          ? "var(--color-danger)"
          : tone === "info"
            ? "var(--color-info)"
            : "var(--color-text-secondary)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        color,
        background: "rgba(255,255,255,0.62)",
        border: "1px solid rgba(255,255,255,0.78)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.82)",
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full pulse-dot" style={{ background: color }} />
      {children}
    </span>
  );
}
