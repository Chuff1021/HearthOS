import { NextRequest, NextResponse } from 'next/server';
import { ensureDefaultRecurringJobs, listJobs, runSupervisorTick } from '@/lib/gabe-ops';

export async function POST(request: NextRequest) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    await ensureDefaultRecurringJobs();
    const ran = await runSupervisorTick(baseUrl);
    return NextResponse.json({ ok: true, ran });
  } catch (err) {
    return NextResponse.json({ error: 'Supervisor run failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDefaultRecurringJobs();
    const jobs = await listJobs(200);
    const active = jobs.filter((j) => j.status === 'active').length;
    const queued = jobs.filter((j) => j.status === 'queued').length;
    const failed = jobs.filter((j) => j.status === 'failed').length;

    let diagramConfidence = null as null | { score: number; total: number };
    try {
      const engine = process.env.GABE_ENGINE_URL;
      if (engine) {
        const res = await fetch(`${engine.replace(/\/$/, '')}/ops/diagram-confidence`, { cache: 'no-store' });
        if (res.ok) diagramConfidence = await res.json();
      }
    } catch {}

    return NextResponse.json({
      counts: { active, queued, failed },
      agentStatus: {
        orchestrator: 'online',
        modelDetector: 'online',
        intentClassifier: 'online',
        manualRetriever: 'online',
        diagramAnalyzer: 'online',
        webResearcher: 'online',
        expertReasoner: 'online',
        validator: 'online',
        responseComposer: 'online',
        selfRefiner: 'online',
        testEngine: 'online',
      },
      diagramConfidence,
      jobs,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to get supervisor status' }, { status: 500 });
  }
}
