import { notFound } from "next/navigation";
import { requireOrganizationFeature } from "@/lib/tenant/feature-access";

export default async function GabeAuditLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireOrganizationFeature("gabeAudit", "gabe:manage");
  } catch {
    notFound();
  }

  return children;
}
