import Link from "next/link";
import type { ReactNode } from "react";
import FlameLogo from "@/components/FlameLogo";

export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f5f6f8] px-4 py-5 text-[#1d1d1f] sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-[1440px] flex-col overflow-hidden rounded-lg border border-white bg-white shadow-[0_24px_80px_rgba(31,41,55,0.12)] sm:min-h-[calc(100vh-64px)]">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/70 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="HearthOS home">
            <FlameLogo size={32} />
            <span className="text-[15px] font-semibold">HearthOS</span>
          </Link>
          <Link href="/" className="text-xs font-medium text-slate-500 transition hover:text-slate-950">
            Back to HearthOS
          </Link>
        </header>

        <div className="grid flex-1 lg:grid-cols-[minmax(360px,0.88fr)_minmax(500px,1.12fr)]">
          <section className="relative hidden overflow-hidden bg-[#171b1f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[url('/marketing/hearthos-showroom-hero.png')] bg-cover bg-center opacity-45" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,15,18,0.18),rgba(12,15,18,0.92))]" />
            <div className="relative max-w-md">
              <span className="text-[11px] font-semibold uppercase text-orange-300">{eyebrow}</span>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.08]">{title}</h1>
              <p className="mt-5 max-w-sm text-sm leading-6 text-white/68">{description}</p>
            </div>
            <div className="relative grid grid-cols-3 gap-3 border-t border-white/15 pt-6 text-[11px] text-white/60">
              <span>One secure login</span>
              <span>Private company data</span>
              <span>Office + field</span>
            </div>
          </section>

          <section className="flex items-center justify-center px-4 py-10 sm:px-10 lg:px-16">
            <div className="w-full max-w-[430px]">
              <div className="mb-7 lg:hidden">
                <span className="text-[11px] font-semibold uppercase text-[#e95519]">{eyebrow}</span>
                <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_55px_rgba(31,41,55,0.08)]">
                {children}
              </div>
              <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
              <p className="mt-8 text-center text-[11px] leading-5 text-slate-400">
                Your company workspace and records are isolated from every other HearthOS account.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
