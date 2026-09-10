import { reportActor, reportFailure, privateHeaders, serviceReportStore, uuid } from "@/lib/service-reports/server";
import { ReportError } from "@/lib/service-reports/store";
import { authorizeCrmApi } from "@/lib/security/crm-access";
export const runtime = "nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const accessDenied = await authorizeCrmApi("/api/tech/service-reports/[id]/pdf", "GET");
    if (accessDenied) return accessDenied;
    const actor = await reportActor(request); if (actor instanceof Response) return actor;
    const {id} = await params; if(!uuid(id)) throw new ReportError("Invalid report ID.");
    const file = await serviceReportStore().file(actor,id);
    return new Response(Uint8Array.from(file.bytes),{headers:{...privateHeaders,"Content-Type":file.type,"Content-Disposition":`inline; filename="${file.name}"`}});
  } catch(error) {return reportFailure(error);}
}
