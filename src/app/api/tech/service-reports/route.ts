import { isOfficeActor } from "@/lib/security/access-policy";
import { authorizeCrmApi } from "@/lib/security/crm-access";
import { reportActor, reportFailure, reportJson, privateHeaders, serviceReportContext, serviceReportStore, reportSql, uuid, assertMailConfigured } from "@/lib/service-reports/server";
import { ReportError } from "@/lib/service-reports/store";
import { verifyReportStorage } from "@/lib/service-reports/storage";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const accessDenied = await authorizeCrmApi("/api/tech/service-reports", "GET");
    if (accessDenied) return accessDenied;
    const actor = await reportActor(request); if (actor instanceof Response) return actor;
    const query = new URL(request.url).searchParams;
    const jobId = query.get("jobId"); const customerId = query.get("customerId");
    if (jobId) {
      const context = await serviceReportContext(actor,jobId);
      return Response.json({ reports: await serviceReportStore().list(actor,{jobId}), context }, { headers: privateHeaders });
    }
    if (!customerId || !isOfficeActor(actor)) throw new ReportError("Select a job or customer you can access.",403);
    const sql = reportSql();
    const [customer] = await sql`SELECT id FROM customers WHERE org_id=${actor.orgId} AND (id::text=${customerId} OR qb_customer_id=${customerId}) LIMIT 1`;
    if (!customer) throw new ReportError("Customer not found.",404);
    return Response.json({ reports: await serviceReportStore().list(actor,{customerId:String(customer.id)}) },{headers:privateHeaders});
  } catch (error) { return reportFailure(error); }
}
export async function POST(request: Request) {
  try {
    const accessDenied = await authorizeCrmApi("/api/tech/service-reports", "POST");
    if (accessDenied) return accessDenied;
    const actor = await reportActor(request); if (actor instanceof Response) return actor;
    const body = await reportJson(request);
    const store = serviceReportStore();
    if (body.action === "check-storage") {
      if (!["owner","admin"].includes(actor.role)) throw new ReportError("Administrator access required.",403);
      return Response.json(await verifyReportStorage(actor.orgId),{headers:privateHeaders});
    }
    if (!body.action) {
      if (!uuid(body.jobId)) throw new ReportError("Invalid job ID.");
      return Response.json({report:await store.create(actor,body.jobId,body.fuel)}, {status:201,headers:privateHeaders});
    }
    if (!uuid(body.id)) throw new ReportError("Invalid report ID.");
    if (body.action === "finalize") {
      if (!Number.isInteger(body.revision) || body.revision < 0) throw new ReportError("Report revision is required.");
      return Response.json({report:await store.finalize(actor,body.id,body.revision)},{headers:privateHeaders});
    }
    if (body.action === "email") {
      if (!uuid(body.actionId) || typeof body.email !== "string") throw new ReportError("Invalid email request.");
      assertMailConfigured();
      return Response.json(await store.email(actor,body.id,body.actionId,body.email.trim()),{headers:privateHeaders});
    }
    throw new ReportError("Unknown report action.");
  } catch (error) { return reportFailure(error); }
}
export async function PUT(request: Request) {
  try {
    const accessDenied = await authorizeCrmApi("/api/tech/service-reports", "PUT");
    if (accessDenied) return accessDenied;
    const actor = await reportActor(request); if (actor instanceof Response) return actor;
    const body = await reportJson(request);
    if (!uuid(body.id) || !Number.isInteger(body.revision) || body.revision < 0) throw new ReportError("Report ID and revision are required.");
    return Response.json({report:await serviceReportStore().save(actor,body.id,body.revision,body.data)},{headers:privateHeaders});
  } catch (error) { return reportFailure(error); }
}
