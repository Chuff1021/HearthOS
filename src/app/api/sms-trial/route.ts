import { dispatchTrial, smsActor, smsResponse } from '@/lib/sms-trial/server';
import { SmsError } from '@/lib/sms-trial/domain';
import { authorizeCrmApi } from '@/lib/security/crm-access';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const accessDenied = await authorizeCrmApi("/api/sms-trial", "GET");
  if (accessDenied) return accessDenied;
  try {
    const jobId = new URL(request.url).searchParams.get('jobId') || undefined;
    const { actor, store } = await smsActor(!jobId);
    return Response.json(await store.state(actor, jobId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return smsResponse(error); }
}
export async function POST(request: Request) {
  const accessDenied = await authorizeCrmApi("/api/sms-trial", "POST");
  if (accessDenied) return accessDenied;
  if (request.headers.get('origin') !== new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const { actor, store } = await smsActor(true);
    const body = await request.json();
    if (body.action === 'setup') {
      const jobId = await store.setup(actor);
      // The appointment and outbox entry have already committed. A messaging
      // failure must not make the caller create a duplicate appointment.
      try { await dispatchTrial(actor, jobId, 'scheduled'); } catch { /* Visible in the persisted message log. */ }
      return Response.json(await store.state(actor));
    }
    if (body.action === 'toggle' && typeof body.enabled === 'boolean') {
      await store.toggle(actor, body.enabled);
      return Response.json(await store.state(actor));
    }
    throw new SmsError('Invalid trial action.');
  } catch (error) { return smsResponse(error); }
}
