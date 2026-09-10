import type { Sql } from "postgres";
import type { CrmActor } from "../security/access-policy";
import { canAccessJob } from "../security/access-policy";
import { ReportError } from "./store";

type SavedPhoto = { id: string; type: string; uri: string; label: string; caption: string; timestamp: string; checklistItemId?: string };
export function decodeLegacyJob(payload: unknown): Record<string, any> | null {
  try {
    const value = typeof payload === "string" ? JSON.parse(payload) : payload;
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
export async function appendLegacyPhotos(sql: Sql, actor: CrmActor, jobId: string, incoming: SavedPhoto[]) {
  return sql.begin(async transaction => {
    const tx = transaction as unknown as Sql;
    const [org] = await tx`SELECT id FROM organizations WHERE id=${actor.orgId} AND slug='default'`;
    if (!org) throw new ReportError("Job not found.",404);
    const [row] = await tx`SELECT id,payload FROM hearth_jobs_store WHERE id=${jobId} FOR UPDATE`;
    const payload = decodeLegacyJob(row?.payload);
    if (!payload || !canAccessJob(actor,{assignedTechs:Array.isArray(payload.assignedTechs) ? payload.assignedTechs : []})) throw new ReportError("Job not found.",404);
    const existing: SavedPhoto[] = Array.isArray(payload.photos) ? payload.photos : [];
    const combined = [...existing];
    for (const photo of incoming) {
      const sameId = combined.find(p => p.id === photo.id);
      if (sameId && (sameId.uri !== photo.uri || sameId.checklistItemId !== photo.checklistItemId)) throw new ReportError("Photo ID conflicts with a saved photo.",409);
      if (!sameId && !combined.some(p => p.uri === photo.uri && p.checklistItemId === photo.checklistItemId)) combined.push(photo);
    }
    const job = { ...payload, id: row.id, photos: combined, updatedAt: new Date().toISOString() };
    // Keep the existing representation; legacy rows may store JSON inside a JSON string.
    const stored = typeof row.payload === "string" ? JSON.stringify(job) : job;
    if (combined.length !== existing.length) await tx`UPDATE hearth_jobs_store SET payload=${tx.json(stored)},updated_at=now() WHERE id=${jobId}`;
    return job;
  });
}
