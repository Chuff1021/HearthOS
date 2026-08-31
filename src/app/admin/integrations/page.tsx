import { db, organizations } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/tenant/context";
import { featuresForOrganization } from "@/lib/tenant/features";

function envSet(value?: string) {
  return value ? "Configured" : "Missing";
}

async function updateIntegrationSettings(formData: FormData) {
  "use server";
  const context = await requirePermission("integrations:manage");
  const features = featuresForOrganization(context.organization);

  const currentSettings =
    typeof context.organization.settings === "object" && context.organization.settings !== null
      ? (context.organization.settings as Record<string, unknown>)
      : {};
  const currentIntegrations =
    typeof currentSettings.integrations === "object" && currentSettings.integrations !== null
      ? (currentSettings.integrations as Record<string, unknown>)
      : {};
  const settings: Record<string, unknown> = {
    ...currentIntegrations,
    qbAutoSync: formData.get("qbAutoSync") === "on",
    qbSyncInterval: formData.get("qbSyncInterval")?.toString() || "15",
  };
  if (features.gabe) {
    settings.gabeEnabled = formData.get("gabeEnabled") === "on";
    settings.gabeModel = formData.get("gabeModel")?.toString() || "llama-3.1-8b-instant";
  }

  await db
    .update(organizations)
    .set({
      settings: {
        ...currentSettings,
        integrations: settings,
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, context.orgId));

  revalidatePath("/admin/integrations");
}

export default async function AdminIntegrationsPage() {
  const context = await requirePermission("integrations:read");
  const org = context.organization;
  const features = featuresForOrganization(org);
  const qbConfigured =
    Boolean(process.env.QUICKBOOKS_CLIENT_ID) &&
    Boolean(process.env.QUICKBOOKS_CLIENT_SECRET) &&
    Boolean(process.env.QUICKBOOKS_REDIRECT_URI);

  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const settings = (org.settings || {}) as Record<string, unknown>;
  const integrations =
    typeof settings.integrations === "object" && settings.integrations !== null
      ? settings.integrations as Record<string, unknown>
      : {};

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="text-sm text-neutral-400">
            Configure QuickBooks{features.gabe ? " and GABE AI" : ""}.
          </p>
        </div>

        <form action={updateIntegrationSettings} className="space-y-6">
          <div className="rounded-xl border border-neutral-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-medium">QuickBooks</div>
                <div className="text-xs text-neutral-400">
                  OAuth connection for sync and invoicing
                </div>
              </div>
              <div className="text-xs text-neutral-300">
                {qbConfigured ? "Configured" : "Missing Env Vars"}
              </div>
            </div>

            <div className="text-sm text-neutral-400">
              Status:{" "}
              <span className={org.qbConnected ? "text-green-400" : "text-red-400"}>
                {org.qbConnected ? "Connected" : "Not Connected"}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="/api/quickbooks/connect"
                className="px-3 py-2 rounded-md bg-green-500 text-black text-sm font-semibold"
              >
                Connect QuickBooks
              </a>
              <span className="text-xs text-neutral-500">
                Environment: {process.env.QUICKBOOKS_ENVIRONMENT || "sandbox"}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 pt-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  name="qbAutoSync"
                  type="checkbox"
                  defaultChecked={integrations.qbAutoSync !== false}
                />
                Enable auto-sync
              </label>
              <div>
                <label className="text-xs text-neutral-400">Sync interval (minutes)</label>
                <input
                  name="qbSyncInterval"
                  defaultValue={String(integrations.qbSyncInterval || "15")}
                  className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {features.gabe && <div className="rounded-xl border border-neutral-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-medium">GABE AI (Groq)</div>
                <div className="text-xs text-neutral-400">
                  AI assistant for technicians and admin
                </div>
              </div>
              <div className="text-xs text-neutral-300">
                {envSet(process.env.GROQ_API_KEY)}
              </div>
            </div>
            <div className="text-sm text-neutral-500">
              API Key: {process.env.GROQ_API_KEY ? "Set in Vercel" : "Missing"}
            </div>

            <div className="grid gap-4 md:grid-cols-2 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  name="gabeEnabled"
                  type="checkbox"
                  defaultChecked={integrations.gabeEnabled !== false}
                />
                Enable GABE AI
              </label>
              <div>
                <label className="text-xs text-neutral-400">Model</label>
                <input
                  name="gabeModel"
                  defaultValue={String(integrations.gabeModel || "llama-3.1-8b-instant")}
                  className="w-full mt-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>}

          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-white text-black text-sm font-semibold"
          >
            Save Integration Settings
          </button>
        </form>
      </div>
    </div>
  );
}
