import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Create your HearthOS account"
      title="Your company starts with a clean workspace."
      description="Create your secure identity, then configure your company, invite the right people, and connect the systems you already use."
      footer={<>Already have an account? <Link href="/sign-in?redirect_url=/account" className="font-semibold text-[#e95519] hover:underline">Sign in</Link></>}
    >
      <SignUp
        fallbackRedirectUrl="/onboarding"
        signInUrl="/sign-in"
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
    </AuthShell>
  );
}
