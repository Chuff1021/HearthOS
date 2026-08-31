"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Check, ChevronRight, CreditCard, Plug, Users, CalendarDays } from "lucide-react";

const steps = [
  { id: "company", label: "Company", icon: Building2 },
  { id: "quickbooks", label: "QuickBooks", icon: Plug },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "team", label: "Team", icon: Users },
  { id: "scheduling", label: "Scheduling", icon: CalendarDays },
] as const;

type StepId = (typeof steps)[number]["id"];

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<StepId>((searchParams.get("step") as StepId) || "company");
  const [completed, setCompleted] = useState<string[]>([]);
  const [needsCompany, setNeedsCompany] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState({ name: "", phone: "", email: "", timezone: "America/Chicago" });
  const [invite, setInvite] = useState({ name: "", email: "", role: "technician" });
  const [schedule, setSchedule] = useState({ dayStart: "08:00", dayEnd: "17:00", defaultDuration: "120" });

  useEffect(() => {
    fetch("/api/onboarding", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (response.status === 403 && data.code === "organization_membership_required") {
          setNeedsCompany(true);
          return;
        }
        if (!response.ok) throw new Error(data.error || "Unable to load onboarding");
        setCompleted(Array.isArray(data.completedSteps) ? data.completedSteps : []);
        if (data.currentStep && data.currentStep !== "complete") setStep(data.currentStep);
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  async function createCompany() {
    setMessage("");
    const response = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(company),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to create company");
    if (data.organization?.clerkOrganizationId) {
      setMessage("Company created. Select it from the company menu after this page reloads.");
    }
    window.location.reload();
  }

  async function advance(current: StepId, next?: StepId, payload: Record<string, unknown> = {}) {
    setMessage("");
    const response = await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedStep: current, currentStep: next || "complete", ...payload }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to save this step");
    setCompleted(data.completedSteps || [...completed, current]);
    if (next) setStep(next);
    else router.push("/account");
  }

  async function sendInvite() {
    setMessage("");
    const response = await fetch("/api/team/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invite),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to send invitation");
    setMessage(`Invitation sent to ${invite.email}.`);
    setInvite({ name: "", email: "", role: "technician" });
  }

  if (loading) return <div className="min-h-screen grid place-items-center bg-[#f4f7fb] text-sm text-slate-500">Preparing your workspace...</div>;

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-950 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white bg-white/75 shadow-[0_30px_90px_rgba(28,45,75,0.13)] backdrop-blur-2xl">
        <header className="flex items-center justify-between border-b border-slate-200/70 px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff5a1f] font-bold text-white shadow-lg shadow-orange-200">H</span>
            <div><div className="font-semibold">HearthOS</div><div className="text-xs text-slate-500">Company setup</div></div>
          </div>
          <div className="text-xs font-medium text-slate-500">Secure dealer workspace</div>
        </header>

        <div className="grid min-h-[650px] lg:grid-cols-[240px_1fr]">
          <nav className="border-b border-slate-200/70 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r lg:p-6">
            <div className="flex gap-2 overflow-x-auto lg:flex-col">
              {steps.map(({ id, label, icon: Icon }, index) => {
                const active = step === id;
                const done = completed.includes(id);
                return (
                  <button key={id} onClick={() => setStep(id)} className={`flex min-w-max items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${active ? "bg-white font-semibold text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                    <span className={`grid h-8 w-8 place-items-center rounded-lg ${done ? "bg-emerald-100 text-emerald-700" : active ? "bg-orange-100 text-[#e94b12]" : "bg-slate-100"}`}>
                      {done ? <Check size={16} /> : <Icon size={16} />}
                    </span>
                    <span><span className="block text-[10px] font-medium uppercase text-slate-400">Step {index + 1}</span>{label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <section className="p-6 sm:p-10 lg:p-14">
            {needsCompany ? (
              <SetupSection title="Create your company" subtitle="This becomes your private HearthOS workspace. No other dealer can access it.">
                <Field label="Company name" value={company.name} onChange={(name) => setCompany({ ...company, name })} />
                <Field label="Owner email" value={company.email} type="email" onChange={(email) => setCompany({ ...company, email })} />
                <Field label="Phone" value={company.phone} onChange={(phone) => setCompany({ ...company, phone })} />
                <PrimaryButton onClick={createCompany}>Create secure workspace</PrimaryButton>
              </SetupSection>
            ) : step === "company" ? (
              <SetupSection title="Company details" subtitle="Set the identity and operating timezone for this dealer workspace.">
                <Field label="Company name" value={company.name} onChange={(name) => setCompany({ ...company, name })} />
                <div className="grid gap-4 sm:grid-cols-2"><Field label="Phone" value={company.phone} onChange={(phone) => setCompany({ ...company, phone })} /><Field label="Email" value={company.email} type="email" onChange={(email) => setCompany({ ...company, email })} /></div>
                <Field label="Timezone" value={company.timezone} onChange={(timezone) => setCompany({ ...company, timezone })} />
                <PrimaryButton onClick={() => advance("company", "quickbooks", { company })}>Continue <ChevronRight size={16} /></PrimaryButton>
              </SetupSection>
            ) : step === "quickbooks" ? (
              <SetupSection title="Connect QuickBooks" subtitle="Customers, items, estimates, invoices, payments, vendors, and purchasing stay inside this company connection.">
                <a href="/api/quickbooks/connect" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#2ca01c] px-5 text-sm font-semibold text-white shadow-lg shadow-green-100">Connect QuickBooks Online <Plug size={16} /></a>
                <SecondaryButton onClick={() => advance("quickbooks", "payments")}>Continue after connecting</SecondaryButton>
              </SetupSection>
            ) : step === "payments" ? (
              <SetupSection title="Connect payments" subtitle="Authorize the dealer's own Square account. Credentials are encrypted and isolated from every other company.">
                <a href="/api/square/connect" className="inline-flex h-12 items-center gap-2 rounded-xl bg-black px-5 text-sm font-semibold text-white">Connect Square <CreditCard size={16} /></a>
                <SecondaryButton onClick={() => advance("payments", "team")}>Continue after connecting</SecondaryButton>
              </SetupSection>
            ) : step === "team" ? (
              <SetupSection title="Invite your team" subtitle="Assign the least access each person needs. More teammates can be added later.">
                <div className="grid gap-4 sm:grid-cols-2"><Field label="Name" value={invite.name} onChange={(name) => setInvite({ ...invite, name })} /><Field label="Email" value={invite.email} type="email" onChange={(email) => setInvite({ ...invite, email })} /></div>
                <label className="block text-sm font-medium text-slate-700">Role<select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-orange-400"><option value="technician">Technician</option><option value="dispatcher">Dispatcher</option><option value="accounting">Accounting</option><option value="sales">Sales</option><option value="admin">Admin</option><option value="read_only">Read only</option></select></label>
                <div className="flex flex-wrap gap-3"><SecondaryButton onClick={sendInvite}>Send invitation</SecondaryButton><PrimaryButton onClick={() => advance("team", "scheduling")}>Continue <ChevronRight size={16} /></PrimaryButton></div>
              </SetupSection>
            ) : (
              <SetupSection title="Scheduling defaults" subtitle="Choose the normal working window used when office staff create and dispatch jobs.">
                <div className="grid gap-4 sm:grid-cols-3"><Field label="Day starts" value={schedule.dayStart} type="time" onChange={(dayStart) => setSchedule({ ...schedule, dayStart })} /><Field label="Day ends" value={schedule.dayEnd} type="time" onChange={(dayEnd) => setSchedule({ ...schedule, dayEnd })} /><Field label="Default minutes" value={schedule.defaultDuration} type="number" onChange={(defaultDuration) => setSchedule({ ...schedule, defaultDuration })} /></div>
                <PrimaryButton onClick={() => advance("scheduling", undefined, { checklist: { scheduling: schedule } })}>Finish setup <Check size={16} /></PrimaryButton>
              </SetupSection>
            )}
            {message && <p className="mt-6 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">{message}</p>}
          </section>
        </div>
      </div>
    </main>
  );
}

function SetupSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="max-w-2xl"><p className="text-xs font-semibold uppercase text-[#e94b12]">HearthOS onboarding</p><h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">{title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">{subtitle}</p><div className="mt-8 space-y-5">{children}</div></div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100" /></label>;
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#ff5a1f] px-5 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition hover:bg-[#e94b12]">{children}</button>;
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">{children}</button>;
}
