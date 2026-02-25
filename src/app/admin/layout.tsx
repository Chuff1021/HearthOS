import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

  if (adminEmail && email !== adminEmail) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-neutral-400">
            This area is restricted to the admin account.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
