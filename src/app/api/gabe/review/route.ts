import { NextRequest, NextResponse } from 'next/server';
import { runGabeReviewAgent } from '@/lib/gabe-review-agent';
import { requirePermission, tenantErrorResponse } from '@/lib/tenant/context';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('gabe:manage');
    const { searchParams } = new URL(request.url);
    const limit = Math.min(500, Math.max(20, Number(searchParams.get('limit') || 100)));
    const insights = await runGabeReviewAgent(limit);
    return NextResponse.json({
      totalSessionsReviewed: limit,
      insightsCount: insights.length,
      insights,
    });
  } catch (err) {
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    return NextResponse.json({ error: 'Failed to run GABE review agent' }, { status: 500 });
  }
}
