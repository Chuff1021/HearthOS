import { reportActor, reportFailure, privateHeaders, serviceReportStore, uuid, boundedBody, normalizeReportPhoto } from "@/lib/service-reports/server";
import { ReportError } from "@/lib/service-reports/store";
import { authorizeCrmApi } from "@/lib/security/crm-access";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const accessDenied = await authorizeCrmApi("/api/tech/service-reports/[id]/photos", "POST");
    if (accessDenied) return accessDenied;
    const actor = await reportActor(request); if (actor instanceof Response) return actor;
    const {id} = await params; if(!uuid(id)) throw new ReportError("Invalid report ID.");
    const bytes = await boundedBody(request,1_600_000);
    const data = await new Response(Uint8Array.from(bytes),{headers:{"Content-Type":request.headers.get("content-type") || ""}}).formData();
    const file = data.get("file"); const slotId = data.get("slotId"); const revision = Number(data.get("revision"));
    if (!(file instanceof File) || typeof slotId !== "string" || !data.has("revision") || !Number.isInteger(revision) || revision < 0) throw new ReportError("Photo, requirement, and revision are required.");
    const report = await serviceReportStore().addPhoto(actor,id,revision,slotId,String(data.get("caption") || ""),await normalizeReportPhoto(file));
    return Response.json({report},{status:201,headers:privateHeaders});
  } catch(error) {return reportFailure(error);}
}
