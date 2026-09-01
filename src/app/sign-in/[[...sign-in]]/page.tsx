import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import DemoCredentialSignIn from "@/components/auth/DemoCredentialSignIn";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const isDemoSignIn = typeof params.demo === "string" && params.demo.length > 0;
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <AuthShell
      eyebrow="HearthOS account"
      title="Welcome back to your business."
      description="Sign in once, choose your company, and continue inside the private HearthOS workspace assigned to your team."
      footer={<>New to HearthOS? <Link href="/#demo-form" className="font-semibold text-[#e95519] hover:underline">Request a demo</Link></>}
    >
      {!clerkEnabled ? (
        <div className="rounded-md border border-black/[0.1] bg-white p-5">
          <p className="text-sm font-semibold text-[#242529]">Account access is unavailable in this environment.</p>
          <p className="mt-2 text-xs leading-5 text-[#74787e]">The secure sign-in service has not been configured here. Your production account and records are unaffected.</p>
        </div>
      ) : isDemoSignIn ? <DemoCredentialSignIn /> : <SignIn
        fallbackRedirectUrl="/account"
        signUpUrl="/sign-up"
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox: "w-full shadow-none",
            card: "w-full rounded-none border-0 bg-transparent p-0 shadow-none",
            header: "hidden",
            socialButtonsBlockButton: "h-12 rounded-md border border-black/[0.12] bg-white text-sm font-medium text-[#26272a] shadow-none hover:bg-[#f5f6f7]",
            socialButtonsBlockButtonText: "font-medium",
            dividerLine: "bg-black/[0.09]",
            dividerText: "text-[11px] text-[#92959a]",
            formFieldLabel: "mb-1.5 text-xs font-medium text-[#4e5156]",
            formFieldInput: "h-12 rounded-md border border-black/[0.14] bg-white px-3.5 text-sm shadow-none focus:border-[#f56323] focus:ring-2 focus:ring-orange-100",
            formButtonPrimary: "h-12 rounded-md bg-[#f56323] text-sm font-semibold shadow-[0_10px_24px_rgba(245,99,35,0.22)] hover:bg-[#d94d12]",
            identityPreview: "rounded-md border border-black/[0.1] bg-white",
            formFieldAction: "text-[#d94d12] hover:text-[#b93f0d]",
            footer: "hidden",
          },
        }}
      />}
    </AuthShell>
  );
}
