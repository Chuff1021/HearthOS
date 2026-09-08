"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { AlertCircle, LoaderCircle, LogOut, RefreshCw } from "lucide-react";

type AccessResult = { userId: string; ok: boolean; message?: string; code?: string };

export default function BusinessAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();
  const { signOut, redirectToSignIn } = useClerk();
  const [result, setResult] = useState<AccessResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const publicPage = ["/pay", "/accept-estimate", "/meeks"].includes(pathname)
    || ["/sign-in", "/sign-up"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const userId = user?.id;

  useEffect(() => {
    if (publicPage || !isLoaded || !userId) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    let cancelled = false;
    async function verify() {
      try {
        const response = await fetch("/api/access", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (cancelled) return;
        setResult({
          userId: userId!, ok: response.ok && data.userId === userId,
          message: data.error || "Unable to verify your business account. Please try again.", code: data.code,
        });
      } catch {
        if (!cancelled) setResult({ userId: userId!, ok: false, message: "Unable to reach HearthOS. Check your connection and try again." });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void verify();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [publicPage, isLoaded, userId, attempt]);

  if (publicPage) return children;
  const current = result?.userId === userId ? result : null;
  if (isLoaded && userId && current?.ok) return children;
  const loading = !isLoaded || Boolean(userId && !current);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <section className="w-full max-w-md space-y-5 rounded-lg border border-gray-200 bg-white p-8 shadow-sm" aria-live="polite">
        {loading ? <LoaderCircle className="animate-spin text-orange-600" aria-hidden="true" /> : <AlertCircle className="text-orange-600" aria-hidden="true" />}
        <h1 className="text-xl font-semibold text-gray-950">{loading ? "Checking your account" : "Business access unavailable"}</h1>
        {!loading && <>
          <p className="text-sm text-gray-700">{userId ? current?.message : "Sign in with your existing HearthOS business account."}</p>
          {user?.primaryEmailAddress?.emailAddress && <p className="break-all text-sm text-gray-600">Signed in as {user.primaryEmailAddress.emailAddress}</p>}
          <p className="text-sm text-gray-600">Your business records have not been loaded. This is not an empty customer list or a QuickBooks disconnection.</p>
          {current?.code && <p className="text-xs text-gray-500">Reference: {current.code}</p>}
          <div className="flex flex-wrap gap-3">
            {userId ? <>
              <button className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-3 text-sm" onClick={() => { setResult(null); setAttempt((value) => value + 1); }}><RefreshCw size={16} />Retry</button>
              <button className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-3 text-sm" onClick={() => void signOut({ redirectUrl: "/" })}><LogOut size={16} />Sign out</button>
            </> : <button className="rounded-md bg-orange-600 px-4 py-3 text-sm text-white" onClick={() => void redirectToSignIn()}>Sign in</button>}
          </div>
        </>}
      </section>
    </main>
  );
}
