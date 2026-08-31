import { NextResponse } from 'next/server';
import { getMeeksApiAccess } from '@/lib/meeks-auth';
import { getTenantFile, tenantFileResponse } from '@/lib/tenant/files';
import { listEnrichedMeeksJobs } from '@/lib/meeks-job-store';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getMeeksApiAccess();
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const { id } = await params;
  const file = await getTenantFile(access.orgId, id);
  if (!file) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }
  if (file.source_type === 'job-photo') {
    const jobs = await listEnrichedMeeksJobs(access.orgId);
    const belongsToMeeksJob = jobs.some((job) => job.linkedJobId === String(file.source_record_id || ''));
    if (!belongsToMeeksJob) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  } else if (file.source_type !== 'meeks-po') {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }
  return tenantFileResponse(file);
}
