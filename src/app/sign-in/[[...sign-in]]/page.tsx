import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import DemoCredentialSignIn from "@/components/auth/DemoCredentialSignIn";

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="HearthOS account"
      title="Welcome back to your business."
      description="Sign in once, choose your company, and continue inside the private HearthOS workspace assigned to your team."
      footer={<>New to HearthOS? <Link href="/#demo-form" className="font-semibold text-[#e95519] hover:underline">Request a demo</Link></>}
    >
      <DemoCredentialSignIn />
      <details className="group bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-center px-6 py-4 text-xs font-semibold text-slate-500 transition hover:text-slate-950">
          Sign in with email, Google, or Apple
        </summary>
        <div className="border-t border-slate-200">
          <SignIn
            fallbackRedirectUrl="/account"
            signUpUrl="/sign-up"
            appearance={{
              elements: {
                rootBox: "w-full",
                cardBox: "w-full shadow-none",
                card: "w-full rounded-none border-0 shadow-none",
                headerTitle: "text-xl font-semibold text-slate-950",
                headerSubtitle: "text-sm text-slate-500",
                formButtonPrimary: "bg-[#f56323] hover:bg-[#d94d12] shadow-none",
                footer: "hidden",
              },
            }}
          />
        </div>
      </details>
    </AuthShell>
  );
}
