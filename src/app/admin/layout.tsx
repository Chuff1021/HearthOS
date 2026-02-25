import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkConfigured = !!(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY
  );

  if (clerkConfigured) {
    // Clerk is configured — verify the user is signed in
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();

    if (!user) {
      redirect("/sign-in");
    }
  }

  // If Clerk is not configured, allow access (no auth)
  return <>{children}</>;
}
