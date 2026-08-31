import { notFound } from "next/navigation";
import { requireOrganizationFeature } from "@/lib/tenant/feature-access";

export default async function TechGabeLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireOrganizationFeature("gabe", "gabe:use");
  } catch {
    notFound();
  }

  return children;
}
