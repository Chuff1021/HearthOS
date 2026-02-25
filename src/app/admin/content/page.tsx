import { db, organizations } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getOrCreateDefaultOrg } from "@/lib/org";

async function updateContent(formData: FormData) {
  "use server";
  const orgId = formData.get("orgId")?.toString();
  if (!orgId) return;

  const content = {
    homepageHeadline: formData.get("homepageHeadline")?.toString() || "",
    homepageSubheadline: formData.get("homepageSubheadline")?.toString() || "",
    primaryCtaText: formData.get("primaryCtaText")?.toString() || "",
    primaryCtaLink: formData.get("primaryCtaLink")?.toString() || "",
    secondaryCtaText: formData.get("secondaryCtaText")?.toString() || "",
    secondaryCtaLink: formData.get("secondaryCtaLink")?.toString() || "",
    heroImageUrl: formData.get("heroImageUrl")?.toString() || "",
    featureOneTitle: formData.get("featureOneTitle")?.toString() || "",
    featureOneBody: formData.get("featureOneBody")?.toString() || "",
    featureTwoTitle: formData.get("featureTwoTitle")?.toString() || "",
    featureTwoBody: formData.get("featureTwoBody")?.toString() || "",
    featureThreeTitle: formData.get("featureThreeTitle")?.toString() || "",
    featureThreeBody: formData.get("featureThreeBody")?.toString() || "",
  };

  const org = await getOrCreateDefaultOrg();
  const baseSettings =
    typeof org.settings === "object" && org.settings !== null
      ? (org.settings as Record<string, unknown>)
      : {};

  await db
    .update(organizations)
    .set({
      settings: {
        ...baseSettings,
        content,
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath("/admin/content");
}

export default async function AdminContentPage() {
  const org = await getOrCreateDefaultOrg();
  const settings = (org.settings || {}) as Record<string, any>;
  const content = settings.content || {};

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Content Manager</h1>
          <p className="text-sm text-neutral-400">
            Edit the marketing copy and hero content used across the site.
          </p>
        </div>

        <form action={updateContent} className="space-y-5">
          <input type="hidden" name="orgId" value={org.id} />

          <div>
            <label className="text-xs text-neutral-400">Homepage Headline</label>
            <input
              name="homepageHeadline"
              defaultValue={content.homepageHeadline || ""}
              className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-400">Homepage Subheadline</label>
            <textarea
              name="homepageSubheadline"
              defaultValue={content.homepageSubheadline || ""}
              className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm min-h-[80px]"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-400">Primary CTA Text</label>
              <input
                name="primaryCtaText"
                defaultValue={content.primaryCtaText || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Primary CTA Link</label>
              <input
                name="primaryCtaLink"
                defaultValue={content.primaryCtaLink || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-400">Secondary CTA Text</label>
              <input
                name="secondaryCtaText"
                defaultValue={content.secondaryCtaText || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Secondary CTA Link</label>
              <input
                name="secondaryCtaLink"
                defaultValue={content.secondaryCtaLink || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-400">Hero Image URL</label>
            <input
              name="heroImageUrl"
              defaultValue={content.heroImageUrl || ""}
              className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-400">Feature 1 Title</label>
              <input
                name="featureOneTitle"
                defaultValue={content.featureOneTitle || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Feature 1 Body</label>
              <input
                name="featureOneBody"
                defaultValue={content.featureOneBody || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-400">Feature 2 Title</label>
              <input
                name="featureTwoTitle"
                defaultValue={content.featureTwoTitle || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Feature 2 Body</label>
              <input
                name="featureTwoBody"
                defaultValue={content.featureTwoBody || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-400">Feature 3 Title</label>
              <input
                name="featureThreeTitle"
                defaultValue={content.featureThreeTitle || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Feature 3 Body</label>
              <input
                name="featureThreeBody"
                defaultValue={content.featureThreeBody || ""}
                className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-white text-black text-sm font-semibold"
          >
            Save Content
          </button>
        </form>
      </div>
    </div>
  );
}
