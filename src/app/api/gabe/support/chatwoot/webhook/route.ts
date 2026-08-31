import { NextRequest, NextResponse } from 'next/server';
import { insertSupportConversation } from '@/lib/gabe-support';
import { timingSafeEqual } from 'node:crypto';
import { db, organizations } from '@/db';
import { eq } from 'drizzle-orm';
import { getIntegrationConnectionByExternalAccount, isTenantIntegrationsEnabled } from '@/lib/integrations/store';

function validWebhookSecret(provided: string | null) {
  const expected = process.env.CHATWOOT_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  try {
    if (!validWebhookSecret(request.headers.get('x-hearthos-webhook-secret'))) {
      return NextResponse.json({ error: 'Invalid Chatwoot webhook secret' }, { status: 401 });
    }
    const body = await request.json();
    const accountId = String(body?.account?.id || body?.account_id || '');
    const orgId = isTenantIntegrationsEnabled()
      ? (accountId ? (await getIntegrationConnectionByExternalAccount('chatwoot', accountId))?.orgId : undefined)
      : (await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, 'default')).limit(1))[0]?.id;
    if (!orgId) return NextResponse.json({ error: 'Chatwoot account is not connected to an organization' }, { status: 404 });
    const conversationId = String(body?.conversation?.id || body?.conversation_id || '');
    const messageId = String(body?.message?.id || body?.id || '');
    const content = String(body?.message?.content || body?.content || body?.message || '').trim();

    if (!content) return NextResponse.json({ error: 'No message content' }, { status: 400 });

    const orchestratorUrl = process.env.GABE_ORCHESTRATOR_URL || process.env.GABE_ENGINE_URL;
    if (!orchestratorUrl) return NextResponse.json({ error: 'No orchestrator configured' }, { status: 503 });

    const r = await fetch(`${orchestratorUrl.replace(/\/$/, '')}/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: content }),
    });
    const data = await r.json();

    const runOutcome = data?.run_outcome || 'answered_partial';
    const handoff = ['refused_unverified', 'escalated_handoff'].includes(runOutcome) ||
      (runOutcome === 'source_evidence_missing' && Number(data?.confidence || 0) < 40);

    const linkId = await insertSupportConversation({
      chatwoot_conversation_id: conversationId,
      chatwoot_message_id: messageId,
      gabe_run_payload: data,
      run_outcome: runOutcome,
      handoff,
      source: 'chatwoot_webhook',
    }, { orgId, trustedSystem: true });

    return NextResponse.json({ ok: true, linked_run_id: linkId, run_outcome: runOutcome, handoff, response: data });
  } catch (e) {
    return NextResponse.json({ error: 'chatwoot_webhook_failed', message: String((e as Error)?.message || e) }, { status: 500 });
  }
}
