import { notFound } from "next/navigation";
import { requireOrganizationFeature } from "@/lib/tenant/feature-access";

export default async function GabeLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireOrganizationFeature("gabe", "gabe:use");
  } catch {
    notFound();
  }

  return children;
}
