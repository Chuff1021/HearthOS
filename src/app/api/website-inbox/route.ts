import { authorizeCrmApi, requireCrmActor } from "@/lib/security/crm-access";
import { websiteInboxConfig } from "@/lib/website-inbox/config";
import { inboxStatuses, parseAction, uuidPattern } from "@/lib/website-inbox/domain";
import { websiteInboxStore } from "@/lib/website-inbox/server";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const accessDenied = await authorizeCrmApi("/api/website-inbox", "GET");
  if (accessDenied) return accessDenied;
  const actor = await requireCrmActor();
  const config = websiteInboxConfig();
  if (!config) return Response.json({ configured: false, items: [], total: 0, sync: null }, { headers });
  if (config.orgId !== actor.orgId) return Response.json({ error: "Website inbox not available" }, { status: 404, headers });
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const status = params.get("status") || "all";
  const offset = Number(params.get("offset") || 0);
  if ((id && !uuidPattern.test(id)) || !["all", ...inboxStatuses].includes(status) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || (params.get("q") || "").length > 200) {
    return Response.json({ error: "Invalid search" }, { status: 400, headers });
  }
  try {
    const store = websiteInboxStore();
    if (id) return Response.json({ activity: await store.activity(actor.orgId, config.source, id) }, { headers });
    const result = await store.list(actor.orgId, config.source, params.get("q") || "", status, offset);
    return Response.json({ configured: true, ...result }, { headers });
  } catch {
    console.warn("[website-inbox] Read unavailable");
    return Response.json({ error: "Website inbox could not be loaded. Your saved requests have not been changed." }, { status: 503, headers });
  }
}

export async function PATCH(request: Request) {
  const accessDenied = await authorizeCrmApi("/api/website-inbox", "PATCH");
  if (accessDenied) return accessDenied;
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers });
  }
  const actor = await requireCrmActor();
  const config = websiteInboxConfig();
  if (!config || config.orgId !== actor.orgId) return Response.json({ error: "Website inbox not available" }, { status: 404, headers });
  let action;
  try {
    if (Number(request.headers.get("content-length") || 0) > 16000) throw new Error("Update too large");
    const body = await request.text();
    if (body.length > 16000) throw new Error("Update too large");
    action = parseAction(JSON.parse(body));
  } catch { return Response.json({ error: "Enter a valid status, note and follow-up date." }, { status: 400, headers }); }
  try {
    const result = await websiteInboxStore().update(actor.orgId, config.source, actor.employeeId, action);
    return Response.json(result.status === 200 ? { ok: true } : { error: result.status === 409 ? "This request changed. Refresh before saving again." : "Request unavailable" }, { status: result.status, headers });
  } catch {
    console.warn("[website-inbox] Update unavailable");
    return Response.json({ error: "Save could not be confirmed. Retry the same update." }, { status: 503, headers });
  }
}
