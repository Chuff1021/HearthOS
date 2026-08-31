import { OrganizationList, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import FlameLogo from "@/components/FlameLogo";

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-[#f5f6f8] px-4 py-6 text-slate-950 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-white bg-white shadow-[0_24px_80px_rgba(31,41,55,0.12)]">
        <header className="flex h-16 items-center justify-between border-b border-slate-200/70 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="HearthOS home">
            <FlameLogo size={32} />
            <span className="text-[15px] font-semibold">HearthOS</span>
          </Link>
          <UserButton afterSignOutUrl="/" />
        </header>

        <div className="grid min-h-[620px] lg:grid-cols-[0.78fr_1.22fr]">
          <section className="border-b border-slate-200 bg-[#171b1f] px-7 py-10 text-white lg:border-b-0 lg:border-r lg:px-10 lg:py-14">
            <span className="text-[11px] font-semibold uppercase text-orange-300">Your HearthOS account</span>
            <h1 className="mt-4 text-3xl font-semibold leading-tight">Choose the company you want to open.</h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">
              Each company is a separate private workspace with its own customers, schedule, financials, integrations, team, and files.
            </p>
            <div className="mt-10 space-y-4 border-t border-white/15 pt-7 text-xs text-white/60">
              <p>Company access follows your assigned role.</p>
              <p>Switch companies without sharing their data.</p>
              <p>Support access is separate and audited.</p>
            </div>
          </section>

          <section className="flex items-center justify-center px-4 py-10 sm:px-10 lg:px-14">
            <div className="w-full max-w-[520px]">
              <OrganizationList
                hidePersonal
                afterSelectOrganizationUrl="/"
                afterCreateOrganizationUrl="/onboarding"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    cardBox: "w-full shadow-none",
                    card: "w-full rounded-lg border border-slate-200 shadow-[0_18px_55px_rgba(31,41,55,0.08)]",
                    organizationListCreateOrganizationActionButton: "text-[#e95519]",
                  },
                }}
              />
              <p className="mt-5 text-center text-xs leading-5 text-slate-400">
                Don&apos;t see the right company? Ask its owner to invite the email address used for this sign-in.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
