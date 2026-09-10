import { reportActor, reportFailure, privateHeaders, serviceReportStore, uuid, reportJson } from "@/lib/service-reports/server";
import { ReportError } from "@/lib/service-reports/store";
import { authorizeCrmApi } from "@/lib/security/crm-access";
export const runtime = "nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string;photoId:string}>}) {
  try {
    const accessDenied = await authorizeCrmApi("/api/tech/service-reports/[id]/photos/[photoId]", "GET");
    if (accessDenied) return accessDenied;
    const actor = await reportActor(request); if (actor instanceof Response) return actor;
    const {id,photoId} = await params; if(!uuid(id)||!uuid(photoId)) throw new ReportError("Invalid photo ID.");
    const file = await serviceReportStore().file(actor,id,photoId);
    return new Response(Uint8Array.from(file.bytes),{headers:{...privateHeaders,"Content-Type":file.type}});
  } catch(error) {return reportFailure(error);}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string;photoId:string}>}) {
  try {
    const accessDenied = await authorizeCrmApi("/api/tech/service-reports/[id]/photos/[photoId]", "DELETE");
    if (accessDenied) return accessDenied;
    const actor = await reportActor(request); if (actor instanceof Response) return actor;
    const {id,photoId} = await params; const body = await reportJson(request);
    if(!uuid(id)||!uuid(photoId)||!Number.isInteger(body.revision)||body.revision<0) throw new ReportError("Photo ID and report revision are required.");
    return Response.json({report:await serviceReportStore().removePhoto(actor,id,photoId,body.revision)},{headers:privateHeaders});
  } catch(error) {return reportFailure(error);}
}
