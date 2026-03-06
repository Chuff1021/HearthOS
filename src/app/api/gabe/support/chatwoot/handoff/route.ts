import { NextRequest, NextResponse } from 'next/server';
import { insertSupportConversation } from '@/lib/gabe-support';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const conversationId = String(body?.conversationId || body?.conversation_id || '');
    const reason = String(body?.reason || 'manual_handoff');
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

    const id = await insertSupportConversation({
      chatwoot_conversation_id: conversationId,
      run_outcome: 'escalated_handoff',
      handoff: true,
      source: 'chatwoot_handoff',
      reason,
      payload: body,
    });

    return NextResponse.json({ ok: true, handoff: true, event_id: id });
  } catch (e) {
    return NextResponse.json({ error: 'chatwoot_handoff_failed', message: String((e as Error)?.message || e) }, { status: 500 });
  }
}
