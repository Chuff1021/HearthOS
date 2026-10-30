import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { withCenterPostgres } from './center-local-postgres.mjs';

test('order retries, tenant isolation and atomic paid inbox delivery', async () => {
  const dir = await mkdtemp('/tmp/hearthos-website-orders-');
  try {
    await build({ entryPoints: ['src/lib/website-orders/store.ts'], bundle: true, platform: 'node', format: 'esm', outfile: `${dir}/store.mjs` });
    const { createWebsiteOrderStore } = await import(pathToFileURL(`${dir}/store.mjs`).href);
    await withCenterPostgres(async ({ sql }) => {
      await sql.unsafe('CREATE TABLE organizations (id uuid PRIMARY KEY); CREATE TABLE users (id uuid PRIMARY KEY, org_id uuid)');
      for (const file of ['website-inbox.sql', 'website-orders.sql', 'website-orders.sql']) {
        const connection = await sql.reserve();
        try { await connection.unsafe(await readFile(`scripts/sql/${file}`, 'utf8')); } finally { connection.release(); }
      }
      const org = '11111111-1111-4111-8111-111111111111', foreign = '22222222-2222-4222-8222-222222222222';
      await sql`INSERT INTO organizations VALUES (${org}),(${foreign})`;
      const store = createWebsiteOrderStore(sql);
      const order = { id: '33333333-3333-4333-8333-333333333333', customer: { name: 'Test', email: 'test@example.invalid', phone: 'test', address: 'test' },
        items: [{ sku: 'test', name: 'Test', quantity: 2, unitPriceCents: 1000 }], shipping: { method: 'Ground', quoteId: 'rate-test', amountCents: 500 }, tax: { quoteId: 'tax-test', amountCents: 200 }, totalCents: 2700, notes: '' };
      await Promise.all([store.reserve(org, order), store.reserve(org, order)]);
      assert.equal((await sql`SELECT count(*)::int n FROM hearth_website_orders`)[0].n, 1);
      await assert.rejects(store.reserve(org, { ...order, totalCents: 1 }));
      assert.equal(await store.read(foreign, order.id), undefined);
      await store.link(org, order.id, { id: 'link1', orderId: 'sq1', url: 'https://square.link/u/test' });
      const payment = { id: 'pay1', orderId: 'sq1', amountCents: 2700, receiptUrl: '' };
      await assert.rejects(store.paid(org, 'aarons-website', order.id, { ...payment, amountCents: 1 }));
      assert.equal((await sql`SELECT count(*)::int n FROM hearth_website_inbox`)[0].n, 0);
      await assert.rejects(store.paid(foreign, 'aarons-website', order.id, payment));
      await Promise.all([store.paid(org, 'aarons-website', order.id, payment), store.paid(org, 'aarons-website', order.id, payment)]);
      assert.equal((await sql`SELECT count(*)::int n FROM hearth_website_inbox`)[0].n, 1);
      const [item] = await sql`SELECT payload FROM hearth_website_inbox`;
      assert.equal(item.payload.items[0].price, 20);
      assert.equal(item.payload.metadata.paymentStatus, 'Paid');
      assert.equal((await store.paidOrders(foreign, [order.id])).length, 0);
      assert.equal((await store.paidOrders(org, [order.id])).length, 1);
      await assert.rejects(store.paid(org, 'aarons-website', order.id, { ...payment, id: 'pay2' }));
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
