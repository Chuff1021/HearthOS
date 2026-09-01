"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function DemoAccountMenu({
  initials,
  name,
  role,
}: {
  initials: string;
  name: string;
  role: string;
}) {
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ redirectUrl: "/sign-in?demo=lttech" });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2 rounded-2xl py-1 pl-1 pr-3"
        style={{
          color: "var(--color-text-primary)",
          background: "rgba(255,255,255,0.84)",
          border: "1px solid rgba(15,23,42,0.06)",
          boxShadow: "0 10px 26px rgba(39,55,82,0.06), inset 0 1px 0 rgba(255,255,255,0.94)",
        }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-[11px] font-bold text-white">
          {initials}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-xs font-semibold">{name}</span>
          <span className="block text-[10px]" style={{ color: "var(--color-text-muted)" }}>{role}</span>
        </span>
        <span className="hidden text-[10px] text-slate-400 md:block">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl p-1.5"
          style={{
            background: "rgba(255,255,255,0.98)",
            border: "1px solid rgba(15,23,42,0.08)",
            boxShadow: "0 22px 60px rgba(15,23,42,0.18)",
          }}
        >
          <Link href="/tech" role="menuitem" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-800 hover:bg-orange-50" onClick={() => setOpen(false)}>
            <Smartphone size={17} className="text-orange-600" />
            Open Technician App
          </Link>
          <button type="button" role="menuitem" disabled={signingOut} onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
            <LogOut size={17} />
            {signingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function DemoSidebarControls() {
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ redirectUrl: "/sign-in?demo=lttech" });
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <Link href="/tech" className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-semibold text-orange-700" style={{ background: "rgba(255,106,0,0.09)", border: "1px solid rgba(255,106,0,0.14)" }}>
        <Smartphone size={14} /> Tech App
      </Link>
      <button type="button" onClick={handleSignOut} disabled={signingOut} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-semibold text-slate-600 disabled:opacity-60" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(15,23,42,0.07)" }}>
        <LogOut size={14} /> {signingOut ? "Wait" : "Sign Out"}
      </button>
    </div>
  );
}
