import { NextRequest, NextResponse } from 'next/server';

type TestCase = {
  id: string;
  category: 'framing' | 'clearances' | 'venting' | 'gas' | 'electrical' | 'wiring' | 'troubleshooting' | 'parts' | 'installation' | 'code';
  question: string;
  requiredTerms: string[];
  expectedSourceHints?: string[];
};

const DEFAULT_CASES: TestCase[] = [
  // Framing / clearances
  { id: 'fpx42-framing', category: 'framing', question: 'For FPX 42 Apex NexGen-Hybrid, what are the minimum framing dimensions?', requiredTerms: ['framing', 'dimension'], expectedSourceHints: ['100-01577', '100-01436'] },
  { id: 'majestic-mantel', category: 'clearances', question: 'What are mantel clearances for Majestic Echelon II?', requiredTerms: ['mantel', 'clearance'], expectedSourceHints: ['majestic', 'echelon'] },
  { id: 'rear-clearance', category: 'clearances', question: 'For Lopi Rockport NexGen-Hybrid, what rear wall clearance is required?', requiredTerms: ['rear', 'clearance'], expectedSourceHints: ['rockport', '100-01593'] },
  { id: 'hearth-protection', category: 'clearances', question: 'For Lopi Liberty NexGen-Hybrid, what hearth/floor protection is required?', requiredTerms: ['hearth', 'protection'], expectedSourceHints: ['100-01586', '100-01511'] },

  // Venting
  { id: 'carlton-vent', category: 'venting', question: 'For Kozy Heat Carlton 46, what vent run limits apply?', requiredTerms: ['vent', 'vertical', 'horizontal'], expectedSourceHints: ['carlton', 'kozy'] },
  { id: 'vent-pipe-size', category: 'venting', question: 'What vent pipe size is required for a direct vent gas fireplace installation?', requiredTerms: ['vent', 'pipe', 'size'] },
  { id: 'termination-clearance', category: 'venting', question: 'What are horizontal vent termination clearance requirements from openings?', requiredTerms: ['termination', 'clearance', 'opening'] },

  // Gas / electrical
  { id: 'probuilder-pressure', category: 'gas', question: 'For FPX ProBuilder 42, what are inlet and manifold gas pressure specs?', requiredTerms: ['pressure', 'manifold', 'inlet'], expectedSourceHints: ['100-01493', 'probuilder'] },
  { id: 'lp-ng-conversion', category: 'gas', question: 'What does the manual say about LP to NG conversion requirements?', requiredTerms: ['conversion', 'lp', 'ng'] },
  { id: 'wiring-module', category: 'wiring', question: 'How is wall switch wiring connected to control module for a gas fireplace?', requiredTerms: ['wiring', 'module', 'switch'] },
  { id: 'transformer-check', category: 'electrical', question: 'What voltage/transformer checks are required before troubleshooting ignition?', requiredTerms: ['voltage', 'transformer', 'ignition'] },

  // Troubleshooting / service
  { id: 'pilot-goes-out', category: 'troubleshooting', question: 'Pilot lights but goes out when main burner starts. What are the recommended diagnostic steps?', requiredTerms: ['pilot', 'diagnostic', 'burner'] },
  { id: 'no-spark', category: 'troubleshooting', question: 'No spark at igniter. What troubleshooting steps should a technician follow?', requiredTerms: ['spark', 'igniter', 'troubleshooting'] },
  { id: 'remote-not-syncing', category: 'electrical', question: 'Remote won’t pair with receiver. What pairing/reset procedure is documented?', requiredTerms: ['remote', 'receiver', 'pair'] },

  // Installation / code compliance
  { id: 'outside-air', category: 'installation', question: 'For FPX 42 Apex NexGen-Hybrid, is outside combustion air required?', requiredTerms: ['outside', 'combustion', 'air'], expectedSourceHints: ['100-01577', '100-01436'] },
  { id: 'fresh-air-intake', category: 'installation', question: 'For FPX 36 Elite NexGen-Hybrid, what outside air intake requirements apply?', requiredTerms: ['outside', 'air', 'intake'], expectedSourceHints: ['100-01584', '100-01585'] },
  { id: 'install-sequence', category: 'installation', question: 'What are the step-by-step installation sequence requirements before first fire?', requiredTerms: ['installation', 'step', 'first'] },
  { id: 'code-permits', category: 'code', question: 'What code compliance notes are listed regarding local permits and inspections?', requiredTerms: ['code', 'permit', 'inspection'] },

  // Parts
  { id: 'parts-diagram', category: 'parts', question: 'Where can I find the exploded parts diagram and part callouts for service replacement?', requiredTerms: ['parts', 'diagram', 'replacement'] },
  { id: 'thermopile-part', category: 'parts', question: 'What part reference is used for thermopile/thermocouple replacement?', requiredTerms: ['part', 'thermopile', 'thermocouple'] },
];

function scoreResult(payload: any, tc: TestCase) {
  const answerBlob = `${payload?.answer || ''} ${payload?.quote || ''}`.toLowerCase();
  const hasTerms = tc.requiredTerms.some((t) => answerBlob.includes(t.toLowerCase()));
  const hasCitation = payload?.source_type === 'manual'
    ? !!(payload?.source_url && payload?.page_number && payload?.quote)
    : payload?.source_type === 'web'
      ? !!(payload?.url && payload?.quote)
      : true;

  let sourceHintOk = true;
  if (tc.expectedSourceHints?.length) {
    const hay = `${payload?.source_url || payload?.url || ''}`.toLowerCase();
    sourceHintOk = tc.expectedSourceHints.some((h) => hay.includes(h.toLowerCase()));
  }

  const pass = hasTerms && hasCitation && sourceHintOk;
  return { pass, hasTerms, hasCitation, sourceHintOk };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(20, Number(searchParams.get('limit') || DEFAULT_CASES.length)));
    const engine = process.env.GABE_ENGINE_URL;
    if (!engine) {
      return NextResponse.json({ error: 'GABE_ENGINE_URL is required' }, { status: 500 });
    }

    const cases = DEFAULT_CASES.slice(0, limit);
    const results: any[] = [];

    for (const tc of cases) {
      try {
        const res = await fetch(`${engine.replace(/\/$/, '')}/query`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question: tc.question }),
          cache: 'no-store',
        });
        const payload = await res.json();
        const s = scoreResult(payload, tc);
        results.push({ id: tc.id, category: tc.category, question: tc.question, ...s, source_type: payload?.source_type, certainty: payload?.certainty, validator_notes: payload?.validator_notes || [], source_url: payload?.source_url || payload?.url, page_number: payload?.page_number || null });
      } catch (err) {
        results.push({ id: tc.id, question: tc.question, pass: false, error: err instanceof Error ? err.message : 'query_failed' });
      }
    }

    const passed = results.filter((r) => r.pass).length;
    const total = results.length;
    const accuracy = total ? Number(((passed / total) * 100).toFixed(1)) : 0;

    const failureClasses = {
      missingTerms: results.filter((r) => r.pass === false && r.hasTerms === false).length,
      missingCitation: results.filter((r) => r.pass === false && r.hasCitation === false).length,
      sourceMismatch: results.filter((r) => r.pass === false && r.sourceHintOk === false).length,
      queryErrors: results.filter((r) => !!r.error).length,
    };

    const categories = Array.from(new Set(results.map((r) => r.category).filter(Boolean)));
    const categoryAccuracy = Object.fromEntries(categories.map((c) => {
      const set = results.filter((r) => r.category === c);
      const p = set.filter((r) => r.pass).length;
      return [c, { passed: p, total: set.length, accuracy: set.length ? Number(((p / set.length) * 100).toFixed(1)) : 0 }];
    }));

    const validatorRejections = results.filter((r) => r.source_type === 'none' && r.certainty === 'Unverified').length;
    const downgradedOutputs = results.filter((r) => ['Verified Partial', 'Interpreted'].includes(String(r.certainty || ''))).length;
    const fallbackUsage = results.filter((r) => r.source_type === 'web' || r.source_type === 'none').length;
    const unverifiedBlocked = results.filter((r) => r.source_type === 'none' && r.certainty === 'Unverified').length;

    return NextResponse.json({
      passed,
      total,
      accuracy,
      failureClasses,
      categoryAccuracy,
      validatorRejections,
      downgradedOutputs,
      validatorRejectionRate: total ? Number(((validatorRejections / total) * 100).toFixed(1)) : 0,
      fallbackUsageRate: total ? Number(((fallbackUsage / total) * 100).toFixed(1)) : 0,
      unverifiedAnswersBlocked: unverifiedBlocked,
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to run gabe test engine' }, { status: 500 });
  }
}
