"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight } from "lucide-react";
import DocumentDrawer from "./DocumentDrawer";

export default function PurchaseOrderDetailsButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    const button = trigger.current;
    return () => {
      element?.close();
      button?.focus({ preventScroll: true });
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-label={`View purchase order ${label}`}
      className="inline-flex items-center gap-1 text-left text-xs font-semibold"
      style={{ color: "var(--billing-accent, var(--color-ember))" }}
      onClick={() => setOpen(true)}>
      {label}<ArrowUpRight size={14} aria-hidden="true" />
    </button>
    {open && createPortal(
      <dialog ref={dialog} aria-label="Purchase order details" className="billing-surface"
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", margin: 0, padding: 0, border: 0, background: "transparent" }}
        onCancel={(event) => { event.preventDefault(); setOpen(false); }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
          )).filter((element) => element.getClientRects().length > 0);
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!first || !last) { event.preventDefault(); return; }
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}>
        <DocumentDrawer type="purchase-order" id={id} onClose={() => setOpen(false)} />
      </dialog>, document.body
    )}
  </>;
}
