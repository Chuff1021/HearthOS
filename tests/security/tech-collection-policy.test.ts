import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Job } from '../../src/lib/job-store';
import { invoiceBelongsToJob, selectCollectionInvoice, type CollectionInvoice } from '../../src/lib/square/collection-policy';

const job = { id: 'job-one', customerId: 'customer-one', linkedInvoiceId: '101' } as Job;
const invoice: CollectionInvoice = { id: 'invoice-one', invoiceNumber: '1001', qbInvoiceId: '101',
  customerId: 'customer-one', qbCustomerId: 'qb-customer-one', customerName: 'Synthetic', balance: '100.00', status: 'sent', jobId: null };

test('job references resolve to the assigned customer linked invoice, not a job UUID invoice', () => {
  assert.equal(selectCollectionInvoice(job.id, [job], [invoice]), invoice);
  for (const reference of [invoice.id, invoice.qbInvoiceId!, invoice.invoiceNumber, `QB-${invoice.invoiceNumber}`]) {
    assert.equal(selectCollectionInvoice(reference, [job], [invoice]), invoice);
  }
  assert.equal(invoiceBelongsToJob(invoice, { ...job, customerId: invoice.qbCustomerId! }), true);
});

test('an explicit invoice can be collected without a job assignment; job matching still validates customer', () => {
  assert.equal(selectCollectionInvoice(invoice.invoiceNumber, [], [invoice]), invoice);
  assert.throws(() => selectCollectionInvoice(job.id, [{ ...job, customerId: 'another-customer' }], [invoice]));
  assert.throws(() => selectCollectionInvoice(job.id, [{ ...job, linkedInvoiceId: 'another-invoice' }], [invoice]));
  assert.equal(invoiceBelongsToJob({ ...invoice, jobId: 'other-job' }, { ...job, linkedInvoiceId: undefined }), false);
});

test('unlinked jobs require an unambiguous customer invoice; estimate numbers are not payment references', () => {
  const unlinked = { ...job, linkedInvoiceId: undefined, linkedEstimateId: 'estimate', linkedDocumentNumber: '9999' };
  assert.equal(selectCollectionInvoice(job.id, [unlinked], [invoice]), invoice);
  const second = { ...invoice, id: 'invoice-two', qbInvoiceId: 'qb-two', invoiceNumber: '1002' };
  assert.equal(selectCollectionInvoice(job.id, [unlinked], [invoice, second]), null);
  assert.throws(() => selectCollectionInvoice('9999', [unlinked], [invoice]));
  assert.equal(selectCollectionInvoice(job.id, [unlinked], []), null);
  assert.equal(selectCollectionInvoice(job.id, [unlinked], [{ ...invoice, status: 'paid', balance: '0.00' }]), null);
});

test('a paid linked invoice remains identifiable for a same-token capture replay', () => {
  const paid = { ...invoice, status: 'paid', balance: '0.00' };
  assert.equal(selectCollectionInvoice(job.id, [job], [paid]), paid);
});
