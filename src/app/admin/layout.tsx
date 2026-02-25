import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Simple session check - check for admin session cookie
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session")?.value;
  
  if (!session) {
    redirect("/admin/login");
  }

  return <>{children}</>;
}
