import type {
  QBCustomer,
  QBItem,
  QBInvoice,
  QBPayment,
  QBSyncStatus,
  QBSyncLog,
  QBVendor,
  QBEstimate,
  QBPurchaseOrder,
  QBBill,
} from './types';
import { QuickBooksClient, createQuickBooksClient } from './client';
import {
  db,
  customers,
  inventoryItems,
  vendors,
  invoices,
  invoiceLineItems,
  payments,
  estimates,
  estimateLineItems,
  purchaseOrders,
  purchaseOrderLineItems,
  bills,
  billLineItems,
} from '@/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// In-memory sync status (in production, use database)
let syncStatus: QBSyncStatus = {
  lastSync: new Date(0),
  status: 'idle',
  recordsSynced: {
    customers: 0,
    items: 0,
    invoices: 0,
    payments: 0,
    vendors: 0,
    estimates: 0,
    purchaseOrders: 0,
    bills: 0,
  },
};

// In-memory cache (kept for cheap reads within a single warm container; DB is source of truth)
let customersCache: QBCustomer[] = [];
let itemsCache: QBItem[] = [];
let invoicesCache: QBInvoice[] = [];
let paymentsCache: QBPayment[] = [];
let vendorsCache: QBVendor[] = [];

// Sync logs (in production, use database)
const syncLogs: QBSyncLog[] = [];

function normalizeSearchValue(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesSearchQuery(query: string, field: string | undefined): boolean {
  const normalizedField = normalizeSearchValue(field);
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) return true;
  if (normalizedField.includes(normalizedQuery)) return true;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  if (!queryTokens.length) return true;

  return queryTokens.every((token) => normalizedField.includes(token));
}

export function getSyncStatus(): QBSyncStatus {
  return { ...syncStatus };
}

export function getSyncLogs(limit = 50): QBSyncLog[] {
  return syncLogs.slice(-limit);
}

// Get cached data
export function getCachedCustomers(): QBCustomer[] {
  return customersCache;
}

export function getCachedItems(): QBItem[] {
  return itemsCache;
}

export function getCachedInvoices(): QBInvoice[] {
  return invoicesCache;
}

export function getCachedPayments(): QBPayment[] {
  return paymentsCache;
}

export function getCachedVendors(): QBVendor[] {
  return vendorsCache;
}

// Helper to add sync log
function addLog(
  type: QBSyncLog['type'],
  direction: QBSyncLog['direction'],
  recordsProcessed: number,
  status: QBSyncLog['status'],
  error?: string
): void {
  syncLogs.push({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    type,
    direction,
    recordsProcessed,
    status,
    error,
  });
}

// === DB persistence helpers ===

function splitName(displayName: string | undefined): [string, string] {
  if (!displayName) return ['', ''];
  const parts = displayName.trim().split(/\s+/);
  if (parts.length <= 1) return [parts[0] || '', ''];
  return [parts[0], parts.slice(1).join(' ')];
}

export async function persistCustomersToDb(orgId: string, qbCustomers: QBCustomer[]): Promise<number> {
  const now = new Date();
  qbCustomers = dedupeBy(qbCustomers, (c) => c.Id);
  const rows = qbCustomers.flatMap((c) => {
    if (!c.Id) return [];
    const [fallbackFirst, fallbackLast] = splitName(c.DisplayName);
    // Prefer BillAddr; fall back to ShipAddr for customers QB only stores
    // a shipping address for.
    const addr: any = (c as any).BillAddr || (c as any).ShipAddr || {};
    return [{
      orgId,
      qbCustomerId: c.Id,
      firstName: c.GivenName || fallbackFirst || c.DisplayName || 'Unknown',
      lastName: c.FamilyName || fallbackLast || '',
      companyName: c.CompanyName,
      email: c.PrimaryEmailAddr?.Address,
      phone: c.PrimaryPhone?.FreeFormNumber,
      addressLine1: addr.Line1 || null,
      addressLine2: addr.Line2 || null,
      city: addr.City || null,
      state: addr.CountrySubDivisionCode || null,
      zip: addr.PostalCode || null,
      source: 'quickbooks',
      isActive: c.Active !== false,
      lastSyncedAt: now,
      updatedAt: now,
    }];
  });

  let written = 0;
  for (const part of chunk(rows, 500)) {
    try {
      const ret = await db.insert(customers).values(part).onConflictDoUpdate({
        target: customers.qbCustomerId,
        set: {
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          companyName: sql`excluded.company_name`,
          email: sql`excluded.email`,
          phone: sql`excluded.phone`,
          addressLine1: sql`excluded.address_line1`,
          addressLine2: sql`excluded.address_line2`,
          city: sql`excluded.city`,
          state: sql`excluded.state`,
          zip: sql`excluded.zip`,
          isActive: sql`excluded.is_active`,
          lastSyncedAt: now,
          updatedAt: now,
        },
      }).returning({ id: customers.id });
      written += ret.length;
    } catch (err) {
      console.error(`Failed bulk-persist customers (chunk ${part.length}):`, err);
    }
  }
  return written;
}

export async function persistItemsToDb(orgId: string, qbItems: QBItem[]): Promise<number> {
  const now = new Date();
  qbItems = dedupeBy(qbItems, (i) => i.Id);
  const rows = qbItems.flatMap((i) => {
    if (!i.Id) return [];
    return [{
      orgId,
      qbItemId: i.Id,
      name: i.Name || i.FullyQualifiedName || `QB Item ${i.Id}`,
      sku: i.Sku,
      description: i.Description,
      category: i.Type === 'Service' ? 'service' : i.Type?.toLowerCase(),
      unitPrice: typeof i.UnitPrice === 'number' ? String(i.UnitPrice) : null,
      cost: typeof i.PurchaseCost === 'number' ? String(i.PurchaseCost) : null,
      quantityOnHand: typeof i.QtyOnHand === 'number' ? Math.floor(i.QtyOnHand) : 0,
      isActive: i.Active !== false,
      lastSyncedAt: now,
      updatedAt: now,
    }];
  });

  let written = 0;
  for (const part of chunk(rows, 500)) {
    try {
      const ret = await db.insert(inventoryItems).values(part).onConflictDoUpdate({
        target: inventoryItems.qbItemId,
        set: {
          name: sql`excluded.name`,
          sku: sql`excluded.sku`,
          description: sql`excluded.description`,
          category: sql`excluded.category`,
          unitPrice: sql`excluded.unit_price`,
          // Don't clobber a cost that a user has manually set via the price-audit
          // auto-correct flow or the inventory edit form.
          cost: sql`case when inventory_items.cost_overridden_at is null then excluded.cost else inventory_items.cost end`,
          quantityOnHand: sql`excluded.quantity_on_hand`,
          isActive: sql`excluded.is_active`,
          lastSyncedAt: now,
          updatedAt: now,
        },
      }).returning({ id: inventoryItems.id });
      written += ret.length;
    } catch (err) {
      console.error(`Failed bulk-persist items (chunk ${part.length}):`, err);
    }
  }
  return written;
}

export async function persistVendorsToDb(orgId: string, qbVendors: QBVendor[]): Promise<number> {
  const now = new Date();
  qbVendors = dedupeBy(qbVendors, (v) => v.Id);
  const rows = qbVendors.flatMap((v) => {
    if (!v.Id) return [];
    return [{
      orgId,
      qbVendorId: v.Id,
      displayName: v.DisplayName || v.CompanyName || `Vendor ${v.Id}`,
      companyName: v.CompanyName,
      firstName: v.GivenName,
      lastName: v.FamilyName,
      email: v.PrimaryEmailAddr?.Address,
      phone: v.PrimaryPhone?.FreeFormNumber,
      phoneAlt: v.AlternatePhone?.FreeFormNumber,
      website: v.WebAddr?.URI,
      addressLine1: v.BillAddr?.Line1,
      addressLine2: v.BillAddr?.Line2,
      city: v.BillAddr?.City,
      state: v.BillAddr?.CountrySubDivisionCode,
      zip: v.BillAddr?.PostalCode,
      accountNumber: v.AcctNum,
      taxId: v.TaxIdentifier,
      is1099: v.Vendor1099 === true,
      paymentTerms: v.TermRef?.name,
      balance: typeof v.Balance === 'number' ? String(v.Balance) : '0',
      isActive: v.Active !== false,
      lastSyncedAt: now,
      updatedAt: now,
    }];
  });

  let written = 0;
  for (const part of chunk(rows, 500)) {
    try {
      const ret = await db.insert(vendors).values(part).onConflictDoUpdate({
        target: vendors.qbVendorId,
        set: {
          displayName: sql`excluded.display_name`,
          companyName: sql`excluded.company_name`,
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          email: sql`excluded.email`,
          phone: sql`excluded.phone`,
          phoneAlt: sql`excluded.phone_alt`,
          website: sql`excluded.website`,
          addressLine1: sql`excluded.address_line1`,
          addressLine2: sql`excluded.address_line2`,
          city: sql`excluded.city`,
          state: sql`excluded.state`,
          zip: sql`excluded.zip`,
          accountNumber: sql`excluded.account_number`,
          taxId: sql`excluded.tax_id`,
          is1099: sql`excluded.is_1099`,
          paymentTerms: sql`excluded.payment_terms`,
          balance: sql`excluded.balance`,
          isActive: sql`excluded.is_active`,
          lastSyncedAt: now,
          updatedAt: now,
        },
      }).returning({ id: vendors.id });
      written += ret.length;
    } catch (err) {
      console.error(`Failed bulk-persist vendors (chunk ${part.length}):`, err);
    }
  }
  return written;
}

// === Bulk write helper ===

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Postgres rejects ON CONFLICT DO UPDATE when the same conflict target appears twice
// in a single INSERT, and QB occasionally returns the same Id twice across paginated
// results. Keep the last occurrence so the freshest data wins.
function dedupeBy<T>(rows: T[], key: (r: T) => string | undefined): T[] {
  const map = new Map<string, T>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    map.set(k, r);
  }
  return [...map.values()];
}

// Same idea but for composite keys (used by payments).
function dedupeByComposite<T>(rows: T[], key: (r: T) => string): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(key(r), r);
  return [...map.values()];
}

// === Lookup helpers (qb*Id → local UUID) ===

async function buildIdMap<T extends { id: string; qbId: string | null }>(rows: T[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.qbId) map.set(r.qbId, r.id);
  }
  return map;
}

async function customerIdMap(orgId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: customers.id, qbId: customers.qbCustomerId })
    .from(customers)
    .where(eq(customers.orgId, orgId));
  return buildIdMap(rows);
}

async function vendorIdMap(orgId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: vendors.id, qbId: vendors.qbVendorId })
    .from(vendors)
    .where(eq(vendors.orgId, orgId));
  return buildIdMap(rows);
}

async function invoiceIdMap(orgId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: invoices.id, qbId: invoices.qbInvoiceId })
    .from(invoices)
    .where(eq(invoices.orgId, orgId));
  return buildIdMap(rows);
}

// === Invoices ===

function deriveInvoiceStatus(qb: QBInvoice): 'draft' | 'sent' | 'paid' | 'void' {
  if ((qb.Balance ?? 0) === 0 && (qb.TotalAmt ?? 0) > 0) return 'paid';
  if (qb.EmailStatus === 'NotSet' && (qb.Balance ?? 0) === (qb.TotalAmt ?? 0)) return 'draft';
  return 'sent';
}

export async function persistInvoicesToDb(orgId: string, qbInvoices: QBInvoice[]): Promise<number> {
  const now = new Date();
  const custMap = await customerIdMap(orgId);
  qbInvoices = dedupeBy(qbInvoices, (inv) => inv.Id);

  const parents = qbInvoices.flatMap((inv) => {
    if (!inv.Id) return [];
    const localCustomerId = custMap.get(inv.CustomerRef?.value || '');
    if (!localCustomerId) return [];
    const lineRows = (inv.Line || []).filter(
      (l) => l.DetailType === 'SalesItemLineDetail' || l.DetailType === 'DescriptionOnly'
    );
    const subtotal = lineRows.reduce((sum, l) => sum + (l.Amount || 0), 0);
    const taxAmount = inv.TxnTaxDetail?.TotalTax ?? 0;
    const totalAmount = inv.TotalAmt ?? subtotal + taxAmount;
    const balance = inv.Balance ?? totalAmount;
    return [{
      orgId,
      customerId: localCustomerId,
      qbInvoiceId: inv.Id,
      invoiceNumber: inv.DocNumber || `QB-${inv.Id}`,
      status: deriveInvoiceStatus(inv),
      issueDate: inv.TxnDate,
      dueDate: inv.DueDate,
      subtotal: String(subtotal),
      taxAmount: String(taxAmount),
      totalAmount: String(totalAmount),
      balance: String(balance),
      notes: inv.PrivateNote,
      updatedAt: now,
    }];
  });

  if (parents.length === 0) return 0;

  // Bulk upsert parents → returns local UUIDs keyed by qbInvoiceId
  const idByQb = new Map<string, string>();
  for (const part of chunk(parents, 500)) {
    const ret = await db.insert(invoices).values(part).onConflictDoUpdate({
      target: invoices.qbInvoiceId,
      set: {
        customerId: sql`excluded.customer_id`,
        invoiceNumber: sql`excluded.invoice_number`,
        status: sql`excluded.status`,
        issueDate: sql`excluded.issue_date`,
        dueDate: sql`excluded.due_date`,
        subtotal: sql`excluded.subtotal`,
        taxAmount: sql`excluded.tax_amount`,
        totalAmount: sql`excluded.total_amount`,
        balance: sql`excluded.balance`,
        notes: sql`excluded.notes`,
        updatedAt: now,
      },
    }).returning({ id: invoices.id, qbId: invoices.qbInvoiceId });
    for (const r of ret) if (r.qbId) idByQb.set(r.qbId, r.id);
  }

  // Replace line items in bulk
  const allLocalIds = [...idByQb.values()];
  for (const part of chunk(allLocalIds, 1000)) {
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, part));
  }
  const lineValues = qbInvoices.flatMap((inv) => {
    const localId = inv.Id ? idByQb.get(inv.Id) : undefined;
    if (!localId) return [];
    const lineRows = (inv.Line || []).filter(
      (l) => l.DetailType === 'SalesItemLineDetail' || l.DetailType === 'DescriptionOnly'
    );
    return lineRows.map((l, idx) => ({
      invoiceId: localId,
      qbItemId: l.SalesItemLineDetail?.ItemRef?.value,
      description: l.Description || l.SalesItemLineDetail?.ItemRef?.name || 'Item',
      quantity: String(l.SalesItemLineDetail?.Qty ?? 1),
      unitPrice: String(l.SalesItemLineDetail?.UnitPrice ?? l.Amount ?? 0),
      total: String(l.Amount ?? 0),
      order: l.LineNum ?? idx + 1,
    }));
  });
  for (const part of chunk(lineValues, 1000)) {
    if (part.length) await db.insert(invoiceLineItems).values(part);
  }

  return idByQb.size;
}

// === Payments ===

export async function persistPaymentsToDb(orgId: string, qbPayments: QBPayment[]): Promise<number> {
  const now = new Date();
  const invMap = await invoiceIdMap(orgId);

  const rows = qbPayments.flatMap((pmt) => {
    if (!pmt.Id) return [];
    const out: {
      orgId: string;
      invoiceId: string;
      qbPaymentId: string;
      amount: string;
      paymentMethod?: string;
      paidAt: Date;
    }[] = [];
    for (const ln of pmt.Line || []) {
      const linkedArr = Array.isArray(ln.LinkedTxn) ? ln.LinkedTxn : ln.LinkedTxn ? [ln.LinkedTxn] : [];
      for (const lt of linkedArr) {
        if (lt.TxnType !== 'Invoice') continue;
        const localInvoiceId = invMap.get(lt.TxnId);
        if (!localInvoiceId) continue;
        out.push({
          orgId,
          invoiceId: localInvoiceId,
          qbPaymentId: pmt.Id,
          amount: String(ln.Amount ?? 0),
          paymentMethod: pmt.PaymentMethodRef?.name?.toLowerCase(),
          paidAt: pmt.TxnDate ? new Date(pmt.TxnDate) : now,
        });
      }
    }
    return out;
  });

  // Dedupe within this batch on (qbPaymentId, invoiceId) — same composite that the unique
  // constraint enforces, so PG won't choke on duplicates inside a single INSERT.
  const deduped = dedupeByComposite(rows, (r) => `${r.qbPaymentId}::${r.invoiceId}`);
  if (deduped.length === 0) return 0;

  let written = 0;
  for (const part of chunk(deduped, 1000)) {
    try {
      const ret = await db.insert(payments).values(part).onConflictDoUpdate({
        target: [payments.qbPaymentId, payments.invoiceId],
        set: {
          amount: sql`excluded.amount`,
          paymentMethod: sql`excluded.payment_method`,
          paidAt: sql`excluded.paid_at`,
        },
      }).returning({ id: payments.id });
      written += ret.length;
    } catch (err) {
      console.error(`Failed to bulk-persist ${part.length} payments:`, err);
    }
  }
  return written;
}

// === Estimates ===

function deriveEstimateStatus(qb: QBEstimate): 'pending' | 'accepted' | 'declined' | 'expired' | 'converted' | 'draft' {
  switch (qb.TxnStatus) {
    case 'Accepted': return 'accepted';
    case 'Rejected': return 'declined';
    case 'Closed': return 'converted';
    case 'Pending':
    default:
      return 'pending';
  }
}

export async function persistEstimatesToDb(orgId: string, qbEstimates: QBEstimate[]): Promise<number> {
  const now = new Date();
  const custMap = await customerIdMap(orgId);
  qbEstimates = dedupeBy(qbEstimates, (est) => est.Id);

  const parents = qbEstimates.flatMap((est) => {
    if (!est.Id) return [];
    const localCustomerId = custMap.get(est.CustomerRef?.value || '');
    if (!localCustomerId) return [];
    const lineRows = (est.Line || []).filter(
      (l) => l.DetailType === 'SalesItemLineDetail' || l.DetailType === 'DescriptionOnly'
    );
    const subtotal = lineRows.reduce((sum, l) => sum + (l.Amount || 0), 0);
    const taxAmount = est.TxnTaxDetail?.TotalTax ?? 0;
    const totalAmount = est.TotalAmt ?? subtotal + taxAmount;
    return [{
      orgId,
      customerId: localCustomerId,
      qbEstimateId: est.Id,
      estimateNumber: est.DocNumber || `QB-${est.Id}`,
      status: deriveEstimateStatus(est),
      issueDate: est.TxnDate,
      expirationDate: est.ExpirationDate,
      acceptedDate: est.AcceptedDate,
      subtotal: String(subtotal),
      taxAmount: String(taxAmount),
      totalAmount: String(totalAmount),
      customerMemo: est.CustomerMemo?.value,
      privateNote: est.PrivateNote,
      emailStatus: est.EmailStatus,
      billEmail: est.BillEmail?.Address,
      lastSyncedAt: now,
      updatedAt: now,
    }];
  });

  if (parents.length === 0) return 0;

  const idByQb = new Map<string, string>();
  for (const part of chunk(parents, 500)) {
    const ret = await db.insert(estimates).values(part).onConflictDoUpdate({
      target: estimates.qbEstimateId,
      set: {
        customerId: sql`excluded.customer_id`,
        estimateNumber: sql`excluded.estimate_number`,
        status: sql`excluded.status`,
        issueDate: sql`excluded.issue_date`,
        expirationDate: sql`excluded.expiration_date`,
        acceptedDate: sql`excluded.accepted_date`,
        subtotal: sql`excluded.subtotal`,
        taxAmount: sql`excluded.tax_amount`,
        totalAmount: sql`excluded.total_amount`,
        customerMemo: sql`excluded.customer_memo`,
        privateNote: sql`excluded.private_note`,
        emailStatus: sql`excluded.email_status`,
        billEmail: sql`excluded.bill_email`,
        lastSyncedAt: now,
        updatedAt: now,
      },
    }).returning({ id: estimates.id, qbId: estimates.qbEstimateId });
    for (const r of ret) if (r.qbId) idByQb.set(r.qbId, r.id);
  }

  const allLocalIds = [...idByQb.values()];
  for (const part of chunk(allLocalIds, 1000)) {
    await db.delete(estimateLineItems).where(inArray(estimateLineItems.estimateId, part));
  }

  const lineValues = qbEstimates.flatMap((est) => {
    const localId = est.Id ? idByQb.get(est.Id) : undefined;
    if (!localId) return [];
    const lineRows = (est.Line || []).filter(
      (l) => l.DetailType === 'SalesItemLineDetail' || l.DetailType === 'DescriptionOnly'
    );
    return lineRows.map((l, idx) => ({
      estimateId: localId,
      qbItemId: l.SalesItemLineDetail?.ItemRef?.value,
      description: l.Description || l.SalesItemLineDetail?.ItemRef?.name || 'Item',
      quantity: String(l.SalesItemLineDetail?.Qty ?? 1),
      unitPrice: String(l.SalesItemLineDetail?.UnitPrice ?? l.Amount ?? 0),
      total: String(l.Amount ?? 0),
      order: l.LineNum ?? idx + 1,
    }));
  });
  for (const part of chunk(lineValues, 1000)) {
    if (part.length) await db.insert(estimateLineItems).values(part);
  }

  return idByQb.size;
}

// === Purchase Orders ===

export async function persistPurchaseOrdersToDb(orgId: string, qbPOs: QBPurchaseOrder[]): Promise<number> {
  const now = new Date();
  const vendMap = await vendorIdMap(orgId);
  qbPOs = dedupeBy(qbPOs, (po) => po.Id);

  const parents = qbPOs.flatMap((po) => {
    if (!po.Id) return [];
    const localVendorId = vendMap.get(po.VendorRef?.value || '');
    if (!localVendorId) return [];
    const lineRows = (po.Line || []).filter(
      (l) => l.DetailType === 'ItemBasedExpenseLineDetail' || l.DetailType === 'AccountBasedExpenseLineDetail'
    );
    const subtotal = lineRows.reduce((sum, l) => sum + (l.Amount || 0), 0);
    const taxAmount = po.TxnTaxDetail?.TotalTax ?? 0;
    const totalAmount = po.TotalAmt ?? subtotal + taxAmount;
    const shipAddr = po.ShipAddr
      ? [po.ShipAddr.Line1, po.ShipAddr.City, po.ShipAddr.CountrySubDivisionCode, po.ShipAddr.PostalCode]
          .filter(Boolean).join(', ')
      : null;
    return [{
      orgId,
      vendorId: localVendorId,
      qbPurchaseOrderId: po.Id,
      poNumber: po.DocNumber || `QB-${po.Id}`,
      status: (po.POStatus === 'Closed' ? 'closed' : 'open') as 'open' | 'closed',
      issueDate: po.TxnDate,
      expectedDate: po.DueDate,
      subtotal: String(subtotal),
      taxAmount: String(taxAmount),
      totalAmount: String(totalAmount),
      shipAddress: shipAddr,
      vendorMessage: po.Memo,
      privateNote: po.PrivateNote,
      emailStatus: po.EmailStatus,
      lastSyncedAt: now,
      updatedAt: now,
    }];
  });

  if (parents.length === 0) return 0;

  const idByQb = new Map<string, string>();
  for (const part of chunk(parents, 500)) {
    const ret = await db.insert(purchaseOrders).values(part).onConflictDoUpdate({
      target: purchaseOrders.qbPurchaseOrderId,
      set: {
        vendorId: sql`excluded.vendor_id`,
        poNumber: sql`excluded.po_number`,
        status: sql`excluded.status`,
        issueDate: sql`excluded.issue_date`,
        expectedDate: sql`excluded.expected_date`,
        subtotal: sql`excluded.subtotal`,
        taxAmount: sql`excluded.tax_amount`,
        totalAmount: sql`excluded.total_amount`,
        shipAddress: sql`excluded.ship_address`,
        vendorMessage: sql`excluded.vendor_message`,
        privateNote: sql`excluded.private_note`,
        emailStatus: sql`excluded.email_status`,
        lastSyncedAt: now,
        updatedAt: now,
      },
    }).returning({ id: purchaseOrders.id, qbId: purchaseOrders.qbPurchaseOrderId });
    for (const r of ret) if (r.qbId) idByQb.set(r.qbId, r.id);
  }

  const allLocalIds = [...idByQb.values()];
  for (const part of chunk(allLocalIds, 1000)) {
    await db.delete(purchaseOrderLineItems).where(inArray(purchaseOrderLineItems.purchaseOrderId, part));
  }

  const lineValues = qbPOs.flatMap((po) => {
    const localId = po.Id ? idByQb.get(po.Id) : undefined;
    if (!localId) return [];
    const lineRows = (po.Line || []).filter(
      (l) => l.DetailType === 'ItemBasedExpenseLineDetail' || l.DetailType === 'AccountBasedExpenseLineDetail'
    );
    return lineRows.map((l, idx) => {
      const itemDetail = l.ItemBasedExpenseLineDetail;
      const acctDetail = l.AccountBasedExpenseLineDetail;
      return {
        purchaseOrderId: localId,
        qbItemId: itemDetail?.ItemRef?.value,
        qbAccountId: acctDetail?.AccountRef?.value,
        description: l.Description || itemDetail?.ItemRef?.name || acctDetail?.AccountRef?.name || 'Item',
        quantity: String(itemDetail?.Qty ?? 1),
        unitCost: String(itemDetail?.UnitPrice ?? l.Amount ?? 0),
        total: String(l.Amount ?? 0),
        order: l.LineNum ?? idx + 1,
      };
    });
  });
  for (const part of chunk(lineValues, 1000)) {
    if (part.length) await db.insert(purchaseOrderLineItems).values(part);
  }

  return idByQb.size;
}

// === Bills ===

function deriveBillStatus(qb: QBBill): 'open' | 'paid' | 'overdue' {
  const balance = qb.Balance ?? 0;
  const total = qb.TotalAmt ?? 0;
  if (balance === 0 && total > 0) return 'paid';
  if (qb.DueDate && balance > 0) {
    const due = new Date(qb.DueDate);
    if (!isNaN(due.getTime()) && due < new Date()) return 'overdue';
  }
  return 'open';
}

export async function persistBillsToDb(orgId: string, qbBills: QBBill[]): Promise<number> {
  const now = new Date();
  const vendMap = await vendorIdMap(orgId);
  const custMap = await customerIdMap(orgId);
  qbBills = dedupeBy(qbBills, (bill) => bill.Id);

  const parents = qbBills.flatMap((bill) => {
    if (!bill.Id) return [];
    const localVendorId = vendMap.get(bill.VendorRef?.value || '');
    if (!localVendorId) return [];
    const lineRows = (bill.Line || []).filter(
      (l) => l.DetailType === 'ItemBasedExpenseLineDetail' || l.DetailType === 'AccountBasedExpenseLineDetail'
    );
    const subtotal = lineRows.reduce((sum, l) => sum + (l.Amount || 0), 0);
    const taxAmount = bill.TxnTaxDetail?.TotalTax ?? 0;
    const totalAmount = bill.TotalAmt ?? subtotal + taxAmount;
    const balance = bill.Balance ?? totalAmount;
    return [{
      orgId,
      vendorId: localVendorId,
      qbBillId: bill.Id,
      billNumber: bill.DocNumber || `QB-${bill.Id}`,
      status: deriveBillStatus(bill),
      issueDate: bill.TxnDate,
      dueDate: bill.DueDate,
      subtotal: String(subtotal),
      taxAmount: String(taxAmount),
      totalAmount: String(totalAmount),
      balance: String(balance),
      privateNote: bill.PrivateNote,
      paymentTerms: bill.SalesTermRef?.name,
      lastSyncedAt: now,
      updatedAt: now,
    }];
  });

  if (parents.length === 0) return 0;

  const idByQb = new Map<string, string>();
  for (const part of chunk(parents, 500)) {
    const ret = await db.insert(bills).values(part).onConflictDoUpdate({
      target: bills.qbBillId,
      set: {
        vendorId: sql`excluded.vendor_id`,
        billNumber: sql`excluded.bill_number`,
        status: sql`excluded.status`,
        issueDate: sql`excluded.issue_date`,
        dueDate: sql`excluded.due_date`,
        subtotal: sql`excluded.subtotal`,
        taxAmount: sql`excluded.tax_amount`,
        totalAmount: sql`excluded.total_amount`,
        balance: sql`excluded.balance`,
        privateNote: sql`excluded.private_note`,
        paymentTerms: sql`excluded.payment_terms`,
        lastSyncedAt: now,
        updatedAt: now,
      },
    }).returning({ id: bills.id, qbId: bills.qbBillId });
    for (const r of ret) if (r.qbId) idByQb.set(r.qbId, r.id);
  }

  const allLocalIds = [...idByQb.values()];
  for (const part of chunk(allLocalIds, 1000)) {
    await db.delete(billLineItems).where(inArray(billLineItems.billId, part));
  }

  const lineValues = qbBills.flatMap((bill) => {
    const localId = bill.Id ? idByQb.get(bill.Id) : undefined;
    if (!localId) return [];
    const lineRows = (bill.Line || []).filter(
      (l) => l.DetailType === 'ItemBasedExpenseLineDetail' || l.DetailType === 'AccountBasedExpenseLineDetail'
    );
    return lineRows.map((l, idx) => {
      const itemDetail = l.ItemBasedExpenseLineDetail;
      const acctDetail = l.AccountBasedExpenseLineDetail;
      const billable = (itemDetail?.BillableStatus || acctDetail?.BillableStatus) === 'Billable';
      const customerRef = itemDetail?.CustomerRef?.value || acctDetail?.CustomerRef?.value;
      return {
        billId: localId,
        qbItemId: itemDetail?.ItemRef?.value,
        qbAccountId: acctDetail?.AccountRef?.value,
        description: l.Description || itemDetail?.ItemRef?.name || acctDetail?.AccountRef?.name || 'Item',
        quantity: String(itemDetail?.Qty ?? 1),
        unitCost: String(itemDetail?.UnitPrice ?? l.Amount ?? 0),
        amount: String(l.Amount ?? 0),
        billable,
        customerId: customerRef ? custMap.get(customerRef) : undefined,
        order: l.LineNum ?? idx + 1,
      };
    });
  });
  for (const part of chunk(lineValues, 1000)) {
    if (part.length) await db.insert(billLineItems).values(part);
  }

  return idByQb.size;
}

async function resolveOrgId(orgId?: string): Promise<string> {
  if (orgId) return orgId;
  const org = await getOrCreateDefaultOrg();
  return org.id;
}

// Sync all data from QuickBooks
export async function syncAllFromQuickBooks(client: QuickBooksClient, orgId?: string): Promise<QBSyncStatus> {
  if (syncStatus.status === 'syncing') {
    throw new Error('Sync already in progress');
  }

  syncStatus.status = 'syncing';
  syncStatus.error = undefined;

  const resolvedOrgId = await resolveOrgId(orgId);

  try {
    // Sync customers (cache + DB)
    try {
      customersCache = await client.getAllCustomers();
      syncStatus.recordsSynced.customers = customersCache.length;
      const persisted = await persistCustomersToDb(resolvedOrgId, customersCache);
      addLog('customers', 'import', persisted, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('customers', 'import', 0, 'error', error);
      console.error('Failed to sync customers:', err);
    }

    // Sync items (products/services) — cache + DB
    try {
      itemsCache = await client.getAllItems();
      syncStatus.recordsSynced.items = itemsCache.length;
      const persisted = await persistItemsToDb(resolvedOrgId, itemsCache);
      addLog('items', 'import', persisted, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('items', 'import', 0, 'error', error);
      console.error('Failed to sync items:', err);
    }

    // Sync vendors (cache + DB)
    try {
      vendorsCache = await client.getAllVendors();
      syncStatus.recordsSynced.vendors = vendorsCache.length;
      const persisted = await persistVendorsToDb(resolvedOrgId, vendorsCache);
      addLog('vendors', 'import', persisted, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('vendors', 'import', 0, 'error', error);
      console.error('Failed to sync vendors:', err);
    }

    // Sync invoices (cache + DB)
    try {
      invoicesCache = await client.getAllInvoices();
      syncStatus.recordsSynced.invoices = invoicesCache.length;
      const persisted = await persistInvoicesToDb(resolvedOrgId, invoicesCache);
      addLog('invoices', 'import', persisted, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('invoices', 'import', 0, 'error', error);
      console.error('Failed to sync invoices:', err);
    }

    // Sync payments (cache + DB)
    try {
      paymentsCache = await client.getAllPayments();
      syncStatus.recordsSynced.payments = paymentsCache.length;
      const persisted = await persistPaymentsToDb(resolvedOrgId, paymentsCache);
      addLog('payments', 'import', persisted, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('payments', 'import', 0, 'error', error);
      console.error('Failed to sync payments:', err);
    }

    // Sync estimates
    try {
      const estimatesData = (await client.getAllEstimates()) as QBEstimate[];
      syncStatus.recordsSynced.estimates = estimatesData.length;
      const persisted = await persistEstimatesToDb(resolvedOrgId, estimatesData);
      addLog('estimates', 'import', persisted, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('estimates', 'import', 0, 'error', error);
      console.error('Failed to sync estimates:', err);
    }

    // Sync purchase orders
    try {
      const posData = (await client.getAllPurchaseOrders()) as QBPurchaseOrder[];
      syncStatus.recordsSynced.purchaseOrders = posData.length;
      const persisted = await persistPurchaseOrdersToDb(resolvedOrgId, posData);
      addLog('purchaseOrders', 'import', persisted, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('purchaseOrders', 'import', 0, 'error', error);
      console.error('Failed to sync purchase orders:', err);
    }

    // Sync bills
    try {
      const billsData = (await client.getAllBills()) as QBBill[];
      syncStatus.recordsSynced.bills = billsData.length;
      const persisted = await persistBillsToDb(resolvedOrgId, billsData);
      addLog('bills', 'import', persisted, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('bills', 'import', 0, 'error', error);
      console.error('Failed to sync bills:', err);
    }

    syncStatus.lastSync = new Date();
    syncStatus.status = 'idle';
    return { ...syncStatus };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    syncStatus.status = 'error';
    syncStatus.error = error;
    throw err;
  }
}

// Sync individual types
export async function syncCustomers(client: QuickBooksClient, orgId?: string): Promise<QBCustomer[]> {
  customersCache = await client.getAllCustomers();
  syncStatus.recordsSynced.customers = customersCache.length;
  const resolvedOrgId = await resolveOrgId(orgId);
  const persisted = await persistCustomersToDb(resolvedOrgId, customersCache);
  addLog('customers', 'import', persisted, 'success');
  return customersCache;
}

export async function syncItems(client: QuickBooksClient, orgId?: string): Promise<QBItem[]> {
  itemsCache = await client.getAllItems();
  syncStatus.recordsSynced.items = itemsCache.length;
  const resolvedOrgId = await resolveOrgId(orgId);
  const persisted = await persistItemsToDb(resolvedOrgId, itemsCache);
  addLog('items', 'import', persisted, 'success');
  return itemsCache;
}

export async function syncVendors(client: QuickBooksClient, orgId?: string): Promise<QBVendor[]> {
  vendorsCache = await client.getAllVendors() as QBVendor[];
  syncStatus.recordsSynced.vendors = vendorsCache.length;
  const resolvedOrgId = await resolveOrgId(orgId);
  const persisted = await persistVendorsToDb(resolvedOrgId, vendorsCache);
  addLog('vendors', 'import', persisted, 'success');
  return vendorsCache;
}

export async function syncInvoices(client: QuickBooksClient): Promise<QBInvoice[]> {
  // Get all invoices (not just 100)
  try {
    invoicesCache = await (client as any).queryAll('SELECT * FROM Invoice ORDERBY TxnDate DESC');
  } catch {
    invoicesCache = await client.getInvoices();
  }
  syncStatus.recordsSynced.invoices = invoicesCache.length;
  addLog('invoices', 'import', invoicesCache.length, 'success');
  return invoicesCache;
}

export async function syncPayments(client: QuickBooksClient): Promise<QBPayment[]> {
  paymentsCache = await client.getPayments();
  syncStatus.recordsSynced.payments = paymentsCache.length;
  addLog('payments', 'import', paymentsCache.length, 'success');
  return paymentsCache;
}

// Create invoice in QuickBooks and update cache
export async function createInvoiceInQuickBooks(
  client: QuickBooksClient,
  invoice: Partial<QBInvoice>
): Promise<QBInvoice> {
  const newInvoice = await client.createInvoice(invoice);
  invoicesCache.unshift(newInvoice);
  syncStatus.recordsSynced.invoices = invoicesCache.length;
  addLog('invoices', 'export', 1, 'success');
  return newInvoice;
}

// Create customer in QuickBooks and update cache
export async function createCustomerInQuickBooks(
  client: QuickBooksClient,
  customer: Partial<QBCustomer>
): Promise<QBCustomer> {
  const newCustomer = await client.createCustomer(customer);
  customersCache.push(newCustomer);
  syncStatus.recordsSynced.customers = customersCache.length;
  addLog('customers', 'export', 1, 'success');
  return newCustomer;
}

// Search helpers
export function searchCustomers(query: string): QBCustomer[] {
  return customersCache.filter(
    (c) => {
      const fields = [
        c.DisplayName,
        c.CompanyName,
        c.PrimaryEmailAddr?.Address,
        c.PrimaryPhone?.FreeFormNumber,
      ];

      return fields.some((field) => matchesSearchQuery(query, field));
    }
  );
}

export function searchVendors(query: string): QBVendor[] {
  return vendorsCache.filter((v) => {
    const fields = [
      v.DisplayName,
      v.CompanyName,
      v.PrimaryEmailAddr?.Address,
      v.PrimaryPhone?.FreeFormNumber,
    ];
    return fields.some((field) => matchesSearchQuery(query, field));
  });
}

export function searchItems(query: string): QBItem[] {
  const lowerQuery = query.toLowerCase();
  return itemsCache.filter(
    (i) =>
      i.Name.toLowerCase().includes(lowerQuery) ||
      i.Description?.toLowerCase().includes(lowerQuery) ||
      i.FullyQualifiedName.toLowerCase().includes(lowerQuery)
  );
}

export function searchInvoices(query: string): QBInvoice[] {
  const lowerQuery = query.toLowerCase();
  return invoicesCache.filter(
    (i) =>
      i.DocNumber?.toLowerCase().includes(lowerQuery) ||
      i.CustomerRef?.name?.toLowerCase().includes(lowerQuery) ||
      i.TotalAmt?.toString().includes(query)
  );
}

// Get items by type
export function getServiceItems(): QBItem[] {
  return itemsCache.filter((i) => i.Type === 'Service');
}

export function getInventoryItems(): QBItem[] {
  return itemsCache.filter((i) => i.Type === 'Inventory');
}

// Get customer by ID
export function getCustomerById(id: string): QBCustomer | undefined {
  return customersCache.find((c) => c.Id === id);
}

// Get item by ID
export function getItemById(id: string): QBItem | undefined {
  return itemsCache.find((i) => i.Id === id);
}

// Get invoices for customer
export function getInvoicesForCustomer(customerId: string): QBInvoice[] {
  return invoicesCache.filter((i) => i.CustomerRef.value === customerId);
}

// Get outstanding invoices (balance > 0)
export function getOutstandingInvoices(): QBInvoice[] {
  return invoicesCache.filter((i) => i.Balance > 0);
}

// Calculate total outstanding
export function getTotalOutstanding(): number {
  return invoicesCache.reduce((sum, i) => sum + i.Balance, 0);
}

// Initialize client from cookies (server-side)
export function getClientFromTokens(
  accessToken: string,
  refreshToken: string,
  realmId: string
): QuickBooksClient {
  const client = createQuickBooksClient();
  client.setTokens({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    x_refresh_token_expires_in: 8726400,
    token_type: 'bearer',
  });
  client.setRealmId(realmId);
  return client;
}
