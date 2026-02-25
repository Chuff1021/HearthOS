import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Clerk handles the redirect to sign-in via middleware,
  // but we double-check here for safety
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return <>{children}</>;
}
