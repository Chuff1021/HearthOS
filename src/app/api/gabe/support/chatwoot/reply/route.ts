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
    const accountId = process.env.CHATWOOT_ACCOUNT_ID;

    if (!chatwootApi || !token || !accountId) {
      return NextResponse.json({
        error: 'chatwoot_not_configured',
        missing: {
          CHATWOOT_API_URL: !chatwootApi,
          CHATWOOT_API_TOKEN: !token,
          CHATWOOT_ACCOUNT_ID: !accountId,
        },
      }, { status: 503 });
    }

    let deliveryReason = 'chatwoot_reply_sent';
    let sent = false;
    let upstream: any = null;

    try {
      const r = await fetch(`${chatwootApi.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', api_access_token: token },
        body: JSON.stringify({ content: message, message_type: 'outgoing' }),
      });
      upstream = await r.json().catch(() => ({ status: r.status }));
      sent = r.ok;
      if (!r.ok) {
        deliveryReason = r.status === 404 ? 'chatwoot_conversation_not_found' : 'chatwoot_reply_failed';
      }
    } catch {
      deliveryReason = 'chatwoot_reply_failed';
    }

    await insertSupportConversation({
      chatwoot_conversation_id: conversationId,
      run_outcome: sent ? 'answered_partial' : 'source_evidence_missing',
      handoff: false,
      source: 'chatwoot_reply',
      delivery_status: sent ? 'sent' : 'failed',
      delivery_reason: deliveryReason,
      payload: {
        message,
        upstream,
      },
    });

    if (!sent) {
      return NextResponse.json({ ok: false, sent: false, error: deliveryReason, upstream }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sent: true, upstream });
  } catch (e) {
    await insertSupportConversation({
      chatwoot_conversation_id: 'unknown',
      run_outcome: 'source_evidence_missing',
      handoff: false,
      source: 'chatwoot_reply',
      delivery_status: 'failed',
      delivery_reason: 'chatwoot_reply_failed',
      payload: { error: String((e as Error)?.message || e) },
    }).catch(() => null);

    return NextResponse.json({ error: 'chatwoot_reply_failed', message: String((e as Error)?.message || e) }, { status: 500 });
  }
}
