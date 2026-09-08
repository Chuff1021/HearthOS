import { requireCrmAdmin } from "@/lib/security/crm-access";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireCrmAdmin();
  return <>{children}</>;
}
