import { appendLegacyPhotos } from "@/lib/service-reports/legacy-photos";
import { authorizeCrmApi } from "@/lib/security/crm-access";
import { ReportError } from "@/lib/service-reports/store";
import { boundedBody, normalizeReportPhoto, privateHeaders, reportActor, reportFailure, reportSql, uuid } from "@/lib/service-reports/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const accessDenied = await authorizeCrmApi("/api/tech/job-photos", "POST");
    if (accessDenied) return accessDenied;
    const actor = await reportActor(request); if (actor instanceof Response) return actor;
    let body;
    try { body = JSON.parse((await boundedBody(request,3_500_000)).toString("utf8")); } catch(error) { if(error instanceof ReportError) throw error; throw new ReportError("Invalid photo upload."); }
    if (!uuid(body?.jobId) || !Array.isArray(body.photos) || !body.photos.length || body.photos.length>10) throw new ReportError("Choose up to 10 photos for this job.");
    const photos = [];
    for (const photo of body.photos) {
      if (!uuid(photo?.id) || typeof photo.uri !== "string" || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(photo.uri)) throw new ReportError("Use a valid JPG or PNG photo.");
      for (const value of [photo.label,photo.caption,photo.checklistItemId]) if(value!==undefined && (typeof value!=="string"||value.length>500)) throw new ReportError("Invalid photo label.");
      const bytes = Buffer.from(photo.uri.slice(photo.uri.indexOf(",")+1),"base64");
      const normalized = await normalizeReportPhoto(new File([bytes],"photo",{type:photo.uri.startsWith("data:image/png")?"image/png":"image/jpeg"}));
      photos.push({id:photo.id,type:photo.checklistItemId?"checklist":"progress",uri:`data:image/jpeg;base64,${normalized.toString("base64")}`,label:photo.label||"Job photo",caption:photo.caption||photo.label||"Job photo",timestamp:new Date().toISOString(),...(photo.checklistItemId?{checklistItemId:photo.checklistItemId}:{})});
    }
    return Response.json({job:await appendLegacyPhotos(reportSql(),actor,body.jobId,photos)},{headers:privateHeaders});
  } catch(error) {return reportFailure(error);}
}
