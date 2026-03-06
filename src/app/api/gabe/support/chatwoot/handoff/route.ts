import { NextRequest, NextResponse } from 'next/server';
import { insertSupportConversation } from '@/lib/gabe-support';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const conversationId = String(body?.conversationId || body?.conversation_id || '');
    const reason = String(body?.reason || 'manual_handoff');
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

    const chatwootApi = process.env.CHATWOOT_API_URL;
    const token = process.env.CHATWOOT_API_TOKEN;
    const accountId = process.env.CHATWOOT_ACCOUNT_ID;

    let handoffSent = false;
    let deliveryReason = 'chatwoot_handoff_sent';
    let upstream: any = null;

    if (chatwootApi && token && accountId) {
      try {
        const noteContent = `GABE handoff requested. Reason: ${reason}`;
        const noteResp = await fetch(`${chatwootApi.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', api_access_token: token },
          body: JSON.stringify({ content: noteContent, message_type: 'outgoing', private: true }),
        });

        const statusResp = await fetch(`${chatwootApi.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', api_access_token: token },
          body: JSON.stringify({ status: 'open' }),
        });

        upstream = {
          note: await noteResp.json().catch(() => ({ status: noteResp.status })),
          status: await statusResp.json().catch(() => ({ status: statusResp.status })),
        };

        handoffSent = noteResp.ok && statusResp.ok;
        if (!handoffSent) {
          deliveryReason = (noteResp.status === 404 || statusResp.status === 404)
            ? 'chatwoot_conversation_not_found'
            : 'chatwoot_handoff_failed';
        }
      } catch {
        deliveryReason = 'chatwoot_handoff_failed';
      }
    } else {
      deliveryReason = 'chatwoot_not_configured';
    }

    const id = await insertSupportConversation({
      chatwoot_conversation_id: conversationId,
      run_outcome: 'escalated_handoff',
      handoff: true,
      source: 'chatwoot_handoff',
      reason,
      delivery_status: handoffSent ? 'sent' : 'failed',
      delivery_reason: deliveryReason,
      payload: { ...body, upstream },
    });

    if (!handoffSent) {
      return NextResponse.json({ ok: false, handoff: true, event_id: id, error: deliveryReason, upstream }, { status: 502 });
    }

    return NextResponse.json({ ok: true, handoff: true, event_id: id, upstream });
  } catch (e) {
    return NextResponse.json({ error: 'chatwoot_handoff_failed', message: String((e as Error)?.message || e) }, { status: 500 });
  }
}
