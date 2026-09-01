import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Create your HearthOS account"
      title="Your company starts with a clean workspace."
      description="Create your secure identity, then configure your company, invite the right people, and connect the systems you already use."
      formTitle="Create your HearthOS account"
      formDescription="Start with your secure identity, then set up your company workspace."
      footer={<>Already have an account? <Link href="/sign-in?redirect_url=/account" className="font-semibold text-[#e95519] hover:underline">Sign in</Link></>}
    >
      <SignUp
        fallbackRedirectUrl="/onboarding"
        signInUrl="/sign-in"
        appearance={{
          elements: {
            rootBox: "!w-full",
            cardBox: "!w-full !shadow-none",
            card: "!w-full !rounded-none !border-0 !bg-transparent !p-0 !shadow-none",
            header: "!hidden",
            headerTitle: "!hidden",
            headerSubtitle: "!hidden",
            socialButtonsBlockButton: "!h-12 !rounded-md !border !border-black/[0.12] !bg-white !text-sm !font-medium !text-[#26272a] !shadow-none hover:!bg-[#f5f6f7]",
            dividerLine: "!bg-black/[0.09]",
            dividerText: "!text-[11px] !text-[#92959a]",
            formFieldLabel: "!mb-1.5 !text-xs !font-medium !text-[#4e5156]",
            formFieldInput: "!h-12 !rounded-md !border !border-black/[0.14] !bg-white !px-3.5 !text-sm !shadow-none focus:!border-[#f56323] focus:!ring-2 focus:!ring-orange-100",
            formButtonPrimary: "!h-12 !rounded-md !bg-[#f56323] !text-sm !font-semibold !shadow-[0_10px_24px_rgba(245,99,35,0.22)] hover:!bg-[#d94d12]",
            footer: "!hidden",
          },
        }}
      />
    </AuthShell>
  );
}
