"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{ padding: "10px 16px", borderRadius: 12, background: "#c2410c", color: "#fff", border: "none", fontWeight: 700 }}
    >
      Print / Save PDF
    </button>
  );
}
