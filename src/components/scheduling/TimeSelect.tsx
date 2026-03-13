"use client";

import type { CSSProperties } from "react";

type TimeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
  stepMinutes?: number;
};

function buildOptions(stepMinutes: number) {
  const options: Array<{ value: string; label: string }> = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const value = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    const labelDate = new Date(`2000-01-01T${value}:00`);
    const label = labelDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    options.push({ value, label });
  }
  return options;
}

export default function TimeSelect({
  value,
  onChange,
  className,
  style,
  stepMinutes = 15,
}: TimeSelectProps) {
  const options = buildOptions(stepMinutes);

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
      style={style}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
