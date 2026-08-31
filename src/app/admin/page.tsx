import Link from "next/link";
import { requirePermission } from "@/lib/tenant/context";
import { featuresForOrganization } from "@/lib/tenant/features";

export default async function AdminHomePage() {
  const context = await requirePermission("organization:read");
  const features = featuresForOrganization(context.organization);
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Admin Backend</h1>
          <p className="text-sm text-neutral-400">
            Manage organization settings and integrations.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/admin/settings"
            className="rounded-xl border border-neutral-800 p-5 hover:border-neutral-600 transition"
          >
            <div className="text-lg font-medium">Organization Settings</div>
            <div className="text-sm text-neutral-400">
              Update business name, branding, and support info.
            </div>
          </Link>
          <Link
            href="/admin/content"
            className="rounded-xl border border-neutral-800 p-5 hover:border-neutral-600 transition"
          >
            <div className="text-lg font-medium">Content Manager</div>
            <div className="text-sm text-neutral-400">
              Edit homepage copy, hero, and feature highlights.
            </div>
          </Link>
          <Link
            href="/admin/integrations"
            className="rounded-xl border border-neutral-800 p-5 hover:border-neutral-600 transition"
          >
            <div className="text-lg font-medium">Integrations</div>
            <div className="text-sm text-neutral-400">
              QuickBooks{features.gabe ? " and GABE AI" : " connection"} status and setup.
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
