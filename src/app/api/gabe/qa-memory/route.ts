import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const engine = process.env.GABE_ENGINE_URL;
    if (!engine) return NextResponse.json({ error: 'GABE_ENGINE_URL is required' }, { status: 500 });

    const payload = {
      entries: [
        {
          question: body.question,
          normalized_question: body.normalizedQuestion || body.question,
          model: body.model,
          answer: body.answer,
          source_pages: body.sourcePages || [],
          source_urls: body.sourceUrls || [],
          verified: body.verdict === 'correct',
          technician_notes: body.technicianNotes || '',
          correction_status: body.verdict || 'needs correction',
        },
      ],
    };

    const res = await fetch(`${engine.replace(/\/$/, '')}/ingest/qa-memory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: 'Failed to write QA memory', details: data }, { status: res.status });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process QA memory write' }, { status: 500 });
  }
}
