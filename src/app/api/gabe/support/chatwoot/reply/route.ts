import { NextRequest, NextResponse } from 'next/server';
import { insertSupportConversation } from '@/lib/gabe-support';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const conversationId = String(body?.conversationId || body?.conversation_id || '');
    const message = String(body?.message || '').trim();
    if (!conversationId || !message) return NextResponse.json({ error: 'conversationId and message required' }, { status: 400 });

    const chatwootApi = process.env.CHATWOOT_API_URL;
    const token = process.env.CHATWOOT_API_TOKEN;

    let upstream: any = { simulated: true };
    if (chatwootApi && token) {
      const r = await fetch(`${chatwootApi.replace(/\/$/, '')}/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', api_access_token: token },
        body: JSON.stringify({ content: message, message_type: 'outgoing' }),
      });
      upstream = await r.json();
    }

    await insertSupportConversation({
      chatwoot_conversation_id: conversationId,
      run_outcome: 'reply_sent',
      handoff: false,
      source: 'chatwoot_reply',
      payload: { message, upstream },
    });

    return NextResponse.json({ ok: true, sent: true, upstream });
  } catch (e) {
    return NextResponse.json({ error: 'chatwoot_reply_failed', message: String((e as Error)?.message || e) }, { status: 500 });
  }
}
