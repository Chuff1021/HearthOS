import { ArrowLeft, Check, Flame, LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  formTitle = "Sign in to HearthOS",
  formDescription = "Use the account connected to your company workspace.",
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  formTitle?: string;
  formDescription?: string;
}) {
  return (
    <main className="min-h-screen bg-[#f4f5f6] text-[#1d1d1f]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(460px,0.88fr)_minmax(560px,1.12fr)]">
        <section className="relative hidden min-h-screen overflow-hidden bg-[#111315] text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[url('/marketing/hearthos-showroom-hero.png')] bg-cover bg-center opacity-55" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,15,17,0.25)_0%,rgba(13,15,17,0.55)_45%,rgba(13,15,17,0.96)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_12%,rgba(245,99,35,0.18),transparent_30%)]" />

          <Link href="/" className="relative m-9 flex w-fit items-center gap-3" aria-label="HearthOS home">
            <BrandMark />
            <span className="text-[16px] font-semibold tracking-[0]">HearthOS</span>
          </Link>

          <div className="relative px-12 pb-12 xl:px-16 xl:pb-14">
            <div className="mb-7 flex items-center gap-2 text-[12px] font-semibold text-[#ff9b67]">
              <LockKeyhole size={15} />
              <span>{eyebrow}</span>
            </div>
            <h1 className="max-w-[590px] !text-[52px] !font-semibold !leading-[1.03] !text-white tracking-[0] xl:!text-[60px]">{title}</h1>
            <p className="mt-6 max-w-[520px] !text-[16px] !leading-7 !text-white/70">{description}</p>

            <div className="mt-12 grid max-w-[570px] grid-cols-3 border-y border-white/15 py-5 text-[11px] leading-5 text-white/62">
              <span className="flex items-start gap-2 pr-4"><Check size={14} className="mt-0.5 shrink-0 text-[#ff8b4d]" />One secure identity</span>
              <span className="flex items-start gap-2 border-l border-white/15 px-4"><Check size={14} className="mt-0.5 shrink-0 text-[#ff8b4d]" />Private company workspace</span>
              <span className="flex items-start gap-2 border-l border-white/15 pl-4"><Check size={14} className="mt-0.5 shrink-0 text-[#ff8b4d]" />Office and field access</span>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-screen flex-col bg-[#fbfbfc]">
          <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-black/[0.07] px-5 sm:px-9 lg:justify-end">
            <Link href="/" className="flex items-center gap-2.5 lg:hidden" aria-label="HearthOS home">
              <BrandMark compact />
              <span className="text-[15px] font-semibold">HearthOS</span>
            </Link>
            <Link href="/" className="flex items-center gap-2 text-[12px] font-medium text-[#666a70] transition hover:text-[#1d1d1f]">
              <ArrowLeft size={15} />
              Back to HearthOS
            </Link>
          </header>

          <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10 lg:px-16">
            <div className="w-full max-w-[430px]">
              <div className="mb-9">
                <div className="mb-6 lg:hidden">
                  <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#d94d12]"><LockKeyhole size={14} /> {eyebrow}</span>
                </div>
                <h2 className="!text-[34px] !font-semibold !leading-[1.08] !text-[#17181b] tracking-[0]">{formTitle}</h2>
                <p className="mt-3 !text-[14px] !leading-6 !text-[#6c7076]">{formDescription}</p>
              </div>

              <div>{children}</div>

              <div className="mt-8 border-t border-black/[0.08] pt-6 text-center text-[13px] text-[#74787e]">{footer}</div>
              <p className="mt-5 flex items-center justify-center gap-2 text-center !text-[11px] !leading-5 !text-[#96999e]">
                <LockKeyhole size={13} /> Your company records remain private to your organization.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[7px] border border-white/15 bg-[#1b1d20] shadow-[0_8px_22px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.12)] ${compact ? "h-9 w-9" : "h-10 w-10"}`}
    >
      <Flame size={compact ? 18 : 20} strokeWidth={1.8} className="text-[#f56323]" />
    </span>
  );
}
