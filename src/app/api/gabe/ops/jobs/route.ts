import { NextRequest, NextResponse } from 'next/server';
import { createJob, ensureDefaultRecurringJobs, listJobs } from '@/lib/gabe-ops';
import { tenantErrorResponse } from '@/lib/tenant/context';
import { requireOrganizationFeature } from '@/lib/tenant/feature-access';

export async function GET(request: NextRequest) {
  try {
    await requireOrganizationFeature('gabeAudit', 'gabe:manage');
    await ensureDefaultRecurringJobs();
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || 100);
    const jobs = await listJobs(limit);
    return NextResponse.json({ jobs });
  } catch (err) {
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    return NextResponse.json({ error: 'Failed to list jobs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireOrganizationFeature('gabeAudit', 'gabe:manage');
    const body = await request.json();
    const job = await createJob({
      jobType: body.jobType,
      recurring: !!body.recurring,
      intervalMin: body.intervalMin,
      runAt: body.runAt,
      payload: body.payload,
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}
