import { db, organizations } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getOrCreateDefaultOrg } from "@/lib/org";

async function updateOrg(formData: FormData) {
  "use server";
  const orgId = formData.get("orgId")?.toString();
  if (!orgId) return;

  const settings = {
    brandPrimary: formData.get("brandPrimary")?.toString() || "",
    brandSecondary: formData.get("brandSecondary")?.toString() || "",
    supportEmail: formData.get("supportEmail")?.toString() || "",
    supportPhone: formData.get("supportPhone")?.toString() || "",
    siteHeadline: formData.get("siteHeadline")?.toString() || "",
    siteTagline: formData.get("siteTagline")?.toString() || "",
  };

  await db
    .update(organizations)
    .set({
      name: formData.get("name")?.toString() || "",
      email: formData.get("email")?.toString() || "",
      phone: formData.get("phone")?.toString() || "",
      address: formData.get("address")?.toString() || "",
      logoUrl: formData.get("logoUrl")?.toString() || "",
      settings,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath("/admin/settings");
}

export default async function AdminSettingsPage() {
  const org = await getOrCreateDefaultOrg();
  const settings = (org.settings || {}) as Record<string, string>;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Organization Settings</h1>
          <p className="text-sm text-neutral-400">
            Update branding and business info used throughout the app.
          </p>
        </div>

        <form action={updateOrg} className="space-y-5">
          <input type="hidden" name="orgId" value={org.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-400">Business Name</label>
              <input
                name="name"
                defaultValue={org.name || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Logo URL</label>
              <input
                name="logoUrl"
                defaultValue={org.logoUrl || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-400">Support Email</label>
              <input
                name="supportEmail"
                defaultValue={settings.supportEmail || org.email || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Support Phone</label>
              <input
                name="supportPhone"
                defaultValue={settings.supportPhone || org.phone || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-400">Primary Brand Color</label>
              <input
                name="brandPrimary"
                defaultValue={settings.brandPrimary || "#f8971f"}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Secondary Brand Color</label>
              <input
                name="brandSecondary"
                defaultValue={settings.brandSecondary || "#1a1a2e"}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-400">Site Headline</label>
            <input
              name="siteHeadline"
              defaultValue={settings.siteHeadline || ""}
              className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-400">Site Tagline</label>
            <input
              name="siteTagline"
              defaultValue={settings.siteTagline || ""}
              className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-400">Address</label>
            <textarea
              name="address"
              defaultValue={org.address || ""}
              className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm min-h-[80px]"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-400">Business Email</label>
            <input
              name="email"
              defaultValue={org.email || ""}
              className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-400">Business Phone</label>
            <input
              name="phone"
              defaultValue={org.phone || ""}
              className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-white text-black text-sm font-semibold"
          >
            Save Settings
          </button>
        </form>
      </div>
    </div>
  );
}
