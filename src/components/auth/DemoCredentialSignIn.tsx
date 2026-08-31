"use client";

import { useSignIn } from "@clerk/nextjs";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { FormEvent, useState } from "react";

const DEMO_EMAIL_DOMAIN = "demo.hearthos.app";

function resolveIdentifier(value: string) {
  const identifier = value.trim();
  if (identifier.includes("@")) return identifier.toLowerCase();
  return `${identifier.toLowerCase()}@${DEMO_EMAIL_DOMAIN}`;
}

function clerkErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Sign in failed. Check the username and password.";
  const candidate = error as {
    errors?: Array<{ longMessage?: string; message?: string }>;
    message?: string;
  };
  return candidate.errors?.[0]?.longMessage
    || candidate.errors?.[0]?.message
    || candidate.message
    || "Sign in failed. Check the username and password.";
}

export default function DemoCredentialSignIn() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setSubmitting(true);
    setError("");
    try {
      const preparation = await fetch("/api/demo/pilot/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!preparation.ok) {
        throw new Error(
          preparation.status === 401
            ? "Sign in failed. Check the username and password."
            : "The demo workspace is temporarily unavailable.",
        );
      }

      const result = await signIn.create({
        strategy: "password",
        identifier: resolveIdentifier(username),
        password,
      });
      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error(`This account requires an additional sign-in step (${result.status}).`);
      }
      await setActive({ session: result.createdSessionId, redirectUrl: "/account/demo" });
    } catch (nextError) {
      setError(clerkErrorMessage(nextError));
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-slate-200 bg-[#fbfbfc] p-6 sm:p-7">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase text-[#e95519]">Demo workspace</p>
        <h2 className="mt-1.5 text-lg font-semibold text-slate-950">Sign in with your demo username</h2>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-700">Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            required
            className="h-11 w-full rounded-md border border-slate-300 bg-white px-3.5 text-sm text-slate-950 outline-none transition focus:border-[#f56323] focus:ring-2 focus:ring-orange-100"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-700">Password</span>
          <span className="relative block">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3.5 pr-11 text-sm text-slate-950 outline-none transition focus:border-[#f56323] focus:ring-2 focus:ring-orange-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        {error ? <p className="text-xs leading-5 text-red-600" role="alert">{error}</p> : null}
        <button
          type="submit"
          disabled={!isLoaded || submitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#f56323] px-4 text-sm font-semibold text-white transition hover:bg-[#d94d12] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <LoaderCircle size={17} className="animate-spin" /> : null}
          {submitting ? "Signing in..." : "Open demo workspace"}
        </button>
      </form>
    </div>
  );
}
