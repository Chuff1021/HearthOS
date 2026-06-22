import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isClerkConfigured } from "@/lib/auth";

export default async function ServiceMapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isClerkConfigured()) return <>{children}</>;

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <>{children}</>;
}
