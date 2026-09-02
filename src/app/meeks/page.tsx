import Link from "next/link";
import { redirect } from "next/navigation";
import MeeksSchedulePanel from "@/components/meeks/MeeksSchedulePanel";
import { getMeeksPortalAccess } from "@/lib/meeks-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeeksPortalPage() {
  const access = await getMeeksPortalAccess();
  if (!access.ok && access.status === 401) {
    redirect("/sign-in?redirect_url=/meeks");
  }

  if (!access.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center overflow-x-hidden px-4" style={{ background: "var(--color-bg)" }}>
        <div className="w-full max-w-lg rounded-[2rem] p-8 text-center" style={{ background: "rgba(255,255,255,0.74)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 24px 70px rgba(35,55,90,0.12)", backdropFilter: "blur(26px)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--color-ember)" }}>HearthOS partner portal</p>
          <h1 className="mt-2 text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Access not approved</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            This Meeks portal is limited to approved Meeks and HearthOS accounts.
          </p>
          <Link href="/sign-in" className="mt-6 inline-flex rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--color-ember), #f59e0b)" }}>
            Sign in with another account
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-[1440px] px-4 pt-6">
        <div className="rounded-[2rem] px-5 py-4" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 24px 70px rgba(35,55,90,0.1)", backdropFilter: "blur(26px)" }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--color-ember)" }}>HearthOS partner portal</p>
              <h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Meeks Installed Services</h1>
            </div>
            <div className="rounded-full px-4 py-2 text-xs font-semibold" style={{ background: "rgba(18,183,106,0.1)", color: "#12b76a", border: "1px solid rgba(18,183,106,0.18)" }}>
              Live scheduling desk
            </div>
          </div>
        </div>
      </div>
      <MeeksSchedulePanel />
    </main>
  );
}
