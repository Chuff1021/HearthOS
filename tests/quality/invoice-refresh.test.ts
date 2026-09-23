import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncInvoiceWorkspace } from '../../src/lib/quickbooks/browser-sync';

test('invoice refresh imports customers, every invoice page, and payments in order', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    calls.push(url);
    assert.equal(options?.method, 'POST');
    assert.equal(options?.cache, 'no-store');
    const more = url.includes('/invoices?startPosition=1&');
    return Response.json({ success: true, fetched: more ? 500 : 1, persisted: more ? 500 : 1,
      nextStartPosition: more ? 501 : null, done: !more });
  };
  try {
    await syncInvoiceWorkspace();
    assert.deepEqual(calls, [
      '/api/quickbooks/sync/customers?startPosition=1&pageSize=500',
      '/api/quickbooks/sync/invoices?startPosition=1&pageSize=500',
      '/api/quickbooks/sync/invoices?startPosition=501&pageSize=500',
      '/api/quickbooks/sync/payments?startPosition=1&pageSize=500',
    ]);
  } finally { globalThis.fetch = original; }
});

test('refresh surfaces partial imports and connection failures instead of reporting cached success', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async input => Response.json({ success: true, fetched: 1,
      persisted: String(input).includes('/invoices?') ? 0 : 1, done: true });
    await assert.rejects(syncInvoiceWorkspace(), /could not be imported/);
    globalThis.fetch = async () => Response.json({ error: 'Not connected' }, { status: 401 });
    await assert.rejects(syncInvoiceWorkspace(), /Not connected/);
  } finally { globalThis.fetch = original; }
});
