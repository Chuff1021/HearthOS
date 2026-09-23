import type { Job } from '@/lib/job-store';

export type CollectionInvoice = {
  id: string; invoiceNumber: string; qbInvoiceId: string | null; customerId: string;
  qbCustomerId: string | null; customerName: string; balance: string; status: string | null;
  jobId: string | null;
};

export class CollectionAccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}

export function invoiceBelongsToJob(invoice: CollectionInvoice, job: Job) {
  const sameCustomer = !!job.customerId && [invoice.customerId, invoice.qbCustomerId].includes(job.customerId);
  if (!sameCustomer) return false;
  if (job.linkedInvoiceId) return [invoice.id, invoice.qbInvoiceId].includes(job.linkedInvoiceId);
  return !invoice.jobId || invoice.jobId === job.id;
}

// Never substitute an estimate number, customer name, or another customer's invoice.
export function selectCollectionInvoice(reference: string, jobs: Job[], invoices: CollectionInvoice[]) {
  const job = jobs.find(row => row.id === reference);
  const allowed = invoices;
  let matches: CollectionInvoice[];
  if (job) {
    matches = allowed.filter(invoice => invoiceBelongsToJob(invoice, job));
    if (!job.linkedInvoiceId) matches = matches.filter(invoice => invoice.status !== 'void' && Number(invoice.balance) > 0);
  } else {
    const clean = reference.replace(/^QB-/i, '');
    const documents = allowed.filter(invoice => invoice.invoiceNumber.replace(/^QB-/i, '') === clean);
    matches = documents.length ? documents : allowed.filter(invoice => invoice.id === reference || invoice.qbInvoiceId === clean);
  }
  if (job && !job.linkedInvoiceId && matches.length !== 1) return null;
  if (matches.length !== 1) throw new CollectionAccessError('Invoice could not be identified. Verify the invoice number or leave it blank for office reconciliation.', 409);
  return matches[0];
}
