'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, MessageSquare, Navigation, RefreshCw } from 'lucide-react';

type TrialState = {
  enabled: boolean; recipient: string; jobId: string | null; admin: boolean; departedAt: string | null;
  messages: Array<{ id: string; event: string; status: string; error_code: string | null; provider_id: string | null }>;
};
export default function TrialMessaging({ jobId }: { jobId?: string }) {
  const [data, setData] = useState<TrialState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/sms-trial${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''}`, { cache: 'no-store' });
      const value = await response.json();
      if (!response.ok) { if (!jobId) setError(value.error || 'Unable to load SMS trial.'); return; }
      setData(value);
    } catch { if (!jobId) setError('Unable to load SMS trial.'); }
  }, [jobId]);
  useEffect(() => { void load(); }, [load]);
  async function act(path: string, body: object) {
    setBusy(true); setError('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Unable to complete action.');
      setData(value); setConfirm(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to complete action.'); }
    finally { setBusy(false); }
  }
  if (jobId && !data) return null;
  const onWay = data?.messages.find(m => m.event === 'on_my_way');
  const card = { background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };
  return <section className="rounded-lg p-4 space-y-4" style={card} aria-label="SMS trial">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold"><MessageSquare size={18} /> Appointment messages</h2>
      <button type="button" onClick={() => void load()} title="Refresh message status" aria-label="Refresh message status" className="p-2 rounded-lg border" disabled={busy}><RefreshCw size={18} /></button>
    </div>
    <p className="text-sm text-gray-500">Trial samples only. Recipient: {data?.recipient || 'loading'}. No other customers receive texts.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {data && !data.jobId && <button type="button" disabled={busy} onClick={() => void act('/api/sms-trial', { action: 'setup' })} className="rounded-lg bg-orange-600 px-4 py-3 text-white font-medium disabled:opacity-50">{busy ? 'Scheduling test...' : 'Create test appointment & send sample'}</button>}
    {data?.jobId && <>
      {data.admin && !jobId && <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={data.enabled} disabled={busy} onChange={e => void act('/api/sms-trial', { action: 'toggle', enabled: e.target.checked })} className="h-5 w-5 accent-orange-600" /> Allow test texts</label>}
      {!data.enabled && <p className="text-sm text-amber-700">Messaging is paused.</p>}
      <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {data.messages.map(message => <li key={message.id} className="py-3 text-sm flex flex-wrap justify-between gap-2">
          <span>{message.event === 'scheduled' ? 'Scheduling confirmation' : 'On My Way'}</span>
          <span className="font-medium capitalize">{message.status}{message.error_code ? ` (${message.error_code})` : ''}</span>
        </li>)}
      </ul>
      {data.messages.some(m => ['unknown','sending'].includes(m.status)) && <p className="text-sm text-amber-700">Awaiting provider confirmation. Do not resend; check delivery status first.</p>}
      {data.messages.some(m => ['failed','undelivered'].includes(m.status)) && <p className="text-sm text-red-600">Twilio did not deliver this sample. The error code above needs review; the appointment remains saved.</p>}
      {jobId && !onWay && !confirm && <button type="button" disabled={busy || !data.enabled} onClick={() => setConfirm(true)} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-white font-medium disabled:opacity-50"><Navigation size={18} /> On My Way</button>}
      {confirm && <div className="space-y-3 border-t pt-3">
        <p className="text-sm">Send Twilio&apos;s delivery-update sample to {data.recipient}? This trial message does not include your name or arrival time.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy || !data.enabled} onClick={() => void act('/api/sms-trial/send', { jobId: data.jobId, event: 'on_my_way' })} className="rounded-lg bg-orange-600 px-4 py-3 text-white disabled:opacity-50">{busy ? 'Sending...' : 'Send trial sample'}</button>
          <button type="button" disabled={busy} onClick={() => setConfirm(false)} className="rounded-lg border px-4 py-3">Cancel</button>
        </div>
      </div>}
      {!jobId && <Link href={`/tech/job/${data.jobId}`} className="inline-flex items-center gap-2 font-medium text-orange-600">Open test job in tech app <ArrowUpRight size={16} /></Link>}
    </>}
  </section>;
}
