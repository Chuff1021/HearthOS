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
import { and, eq } from 'drizzle-orm';
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
  let written = 0;
  const now = new Date();
  for (const c of qbCustomers) {
    if (!c.Id) continue;
    const [fallbackFirst, fallbackLast] = splitName(c.DisplayName);
    const values = {
      orgId,
      qbCustomerId: c.Id,
      firstName: c.GivenName || fallbackFirst || c.DisplayName || 'Unknown',
      lastName: c.FamilyName || fallbackLast || '',
      companyName: c.CompanyName,
      email: c.PrimaryEmailAddr?.Address,
      phone: c.PrimaryPhone?.FreeFormNumber,
      source: 'quickbooks',
      isActive: c.Active !== false,
      lastSyncedAt: now,
      updatedAt: now,
    };
    try {
      await db
        .insert(customers)
        .values(values)
        .onConflictDoUpdate({
          target: customers.qbCustomerId,
          set: {
            firstName: values.firstName,
            lastName: values.lastName,
            companyName: values.companyName,
            email: values.email,
            phone: values.phone,
            isActive: values.isActive,
            lastSyncedAt: now,
            updatedAt: now,
          },
        });
      written++;
    } catch (err) {
      console.error(`Failed to persist customer ${c.Id}:`, err);
    }
  }
  return written;
}

export async function persistItemsToDb(orgId: string, qbItems: QBItem[]): Promise<number> {
  let written = 0;
  const now = new Date();
  for (const i of qbItems) {
    if (!i.Id) continue;
    // Manual upsert (qbItemId has an index but no unique constraint on the existing schema)
    const existing = await db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.qbItemId, i.Id)))
      .limit(1);

    const values = {
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
    };

    try {
      if (existing.length > 0) {
        await db.update(inventoryItems)
          .set({
            name: values.name,
            sku: values.sku,
            description: values.description,
            category: values.category,
            unitPrice: values.unitPrice,
            cost: values.cost,
            quantityOnHand: values.quantityOnHand,
            isActive: values.isActive,
            lastSyncedAt: now,
            updatedAt: now,
          })
          .where(eq(inventoryItems.id, existing[0].id));
      } else {
        await db.insert(inventoryItems).values(values);
      }
      written++;
    } catch (err) {
      console.error(`Failed to persist item ${i.Id}:`, err);
    }
  }
  return written;
}

export async function persistVendorsToDb(orgId: string, qbVendors: QBVendor[]): Promise<number> {
  let written = 0;
  const now = new Date();
  for (const v of qbVendors) {
    if (!v.Id) continue;
    const values = {
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
    };
    try {
      await db
        .insert(vendors)
        .values(values)
        .onConflictDoUpdate({
          target: vendors.qbVendorId,
          set: {
            displayName: values.displayName,
            companyName: values.companyName,
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            phone: values.phone,
            phoneAlt: values.phoneAlt,
            website: values.website,
            addressLine1: values.addressLine1,
            addressLine2: values.addressLine2,
            city: values.city,
            state: values.state,
            zip: values.zip,
            accountNumber: values.accountNumber,
            taxId: values.taxId,
            is1099: values.is1099,
            paymentTerms: values.paymentTerms,
            balance: values.balance,
            isActive: values.isActive,
            lastSyncedAt: now,
            updatedAt: now,
          },
        });
      written++;
    } catch (err) {
      console.error(`Failed to persist vendor ${v.Id}:`, err);
    }
  }
  return written;
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
  let written = 0;
  const now = new Date();
  const custMap = await customerIdMap(orgId);

  for (const inv of qbInvoices) {
    if (!inv.Id) continue;
    const localCustomerId = custMap.get(inv.CustomerRef?.value || '');
    if (!localCustomerId) {
      console.warn(`Skipping invoice ${inv.Id}: customer ${inv.CustomerRef?.value} not in local DB`);
      continue;
    }

    const lineRows = (inv.Line || []).filter(
      (l) => l.DetailType === 'SalesItemLineDetail' || l.DetailType === 'DescriptionOnly'
    );
    const subtotal = lineRows.reduce((sum, l) => sum + (l.Amount || 0), 0);
    const taxAmount = inv.TxnTaxDetail?.TotalTax ?? 0;
    const totalAmount = inv.TotalAmt ?? subtotal + taxAmount;
    const balance = inv.Balance ?? totalAmount;

    const values = {
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
    };

    try {
      const [row] = await db
        .insert(invoices)
        .values(values)
        .onConflictDoUpdate({
          target: invoices.qbInvoiceId,
          set: {
            customerId: values.customerId,
            invoiceNumber: values.invoiceNumber,
            status: values.status,
            issueDate: values.issueDate,
            dueDate: values.dueDate,
            subtotal: values.subtotal,
            taxAmount: values.taxAmount,
            totalAmount: values.totalAmount,
            balance: values.balance,
            notes: values.notes,
            updatedAt: now,
          },
        })
        .returning({ id: invoices.id });

      // Replace line items
      await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, row.id));
      const lineValues = lineRows.map((l, idx) => ({
        invoiceId: row.id,
        qbItemId: l.SalesItemLineDetail?.ItemRef?.value,
        description: l.Description || l.SalesItemLineDetail?.ItemRef?.name || 'Item',
        quantity: String(l.SalesItemLineDetail?.Qty ?? 1),
        unitPrice: String(l.SalesItemLineDetail?.UnitPrice ?? l.Amount ?? 0),
        total: String(l.Amount ?? 0),
        order: l.LineNum ?? idx + 1,
      }));
      if (lineValues.length > 0) await db.insert(invoiceLineItems).values(lineValues);
      written++;
    } catch (err) {
      console.error(`Failed to persist invoice ${inv.Id}:`, err);
    }
  }
  return written;
}

// === Payments ===

export async function persistPaymentsToDb(orgId: string, qbPayments: QBPayment[]): Promise<number> {
  let written = 0;
  const now = new Date();
  const invMap = await invoiceIdMap(orgId);

  for (const pmt of qbPayments) {
    if (!pmt.Id) continue;
    const links = (pmt.Line || []).filter((l) => l.LinkedTxn?.TxnType === 'Invoice');
    if (links.length === 0) {
      // Skip payments not linked to invoices (deposits, etc.) — out of scope for now
      continue;
    }

    for (const link of links) {
      const localInvoiceId = invMap.get(link.LinkedTxn.TxnId);
      if (!localInvoiceId) {
        console.warn(`Skipping payment ${pmt.Id}: invoice ${link.LinkedTxn.TxnId} not in local DB`);
        continue;
      }

      // Manual upsert by (qbPaymentId, invoiceId) since payments table has no unique on qbPaymentId
      const existing = await db
        .select({ id: payments.id })
        .from(payments)
        .where(and(
          eq(payments.orgId, orgId),
          eq(payments.qbPaymentId, pmt.Id),
          eq(payments.invoiceId, localInvoiceId),
        ))
        .limit(1);

      const values = {
        orgId,
        invoiceId: localInvoiceId,
        qbPaymentId: pmt.Id,
        amount: String(link.Amount ?? 0),
        paymentMethod: pmt.PaymentMethodRef?.name?.toLowerCase(),
        paidAt: pmt.TxnDate ? new Date(pmt.TxnDate) : now,
      };

      try {
        if (existing.length > 0) {
          await db.update(payments)
            .set({ amount: values.amount, paymentMethod: values.paymentMethod, paidAt: values.paidAt })
            .where(eq(payments.id, existing[0].id));
        } else {
          await db.insert(payments).values(values);
        }
        written++;
      } catch (err) {
        console.error(`Failed to persist payment ${pmt.Id} → invoice ${link.LinkedTxn.TxnId}:`, err);
      }
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
  let written = 0;
  const now = new Date();
  const custMap = await customerIdMap(orgId);

  for (const est of qbEstimates) {
    if (!est.Id) continue;
    const localCustomerId = custMap.get(est.CustomerRef?.value || '');
    if (!localCustomerId) {
      console.warn(`Skipping estimate ${est.Id}: customer ${est.CustomerRef?.value} not in local DB`);
      continue;
    }

    const lineRows = (est.Line || []).filter(
      (l) => l.DetailType === 'SalesItemLineDetail' || l.DetailType === 'DescriptionOnly'
    );
    const subtotal = lineRows.reduce((sum, l) => sum + (l.Amount || 0), 0);
    const taxAmount = est.TxnTaxDetail?.TotalTax ?? 0;
    const totalAmount = est.TotalAmt ?? subtotal + taxAmount;

    const values = {
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
    };

    try {
      const [row] = await db
        .insert(estimates)
        .values(values)
        .onConflictDoUpdate({
          target: estimates.qbEstimateId,
          set: {
            customerId: values.customerId,
            estimateNumber: values.estimateNumber,
            status: values.status,
            issueDate: values.issueDate,
            expirationDate: values.expirationDate,
            acceptedDate: values.acceptedDate,
            subtotal: values.subtotal,
            taxAmount: values.taxAmount,
            totalAmount: values.totalAmount,
            customerMemo: values.customerMemo,
            privateNote: values.privateNote,
            emailStatus: values.emailStatus,
            billEmail: values.billEmail,
            lastSyncedAt: now,
            updatedAt: now,
          },
        })
        .returning({ id: estimates.id });

      await db.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, row.id));
      const lineValues = lineRows.map((l, idx) => ({
        estimateId: row.id,
        qbItemId: l.SalesItemLineDetail?.ItemRef?.value,
        description: l.Description || l.SalesItemLineDetail?.ItemRef?.name || 'Item',
        quantity: String(l.SalesItemLineDetail?.Qty ?? 1),
        unitPrice: String(l.SalesItemLineDetail?.UnitPrice ?? l.Amount ?? 0),
        total: String(l.Amount ?? 0),
        order: l.LineNum ?? idx + 1,
      }));
      if (lineValues.length > 0) await db.insert(estimateLineItems).values(lineValues);
      written++;
    } catch (err) {
      console.error(`Failed to persist estimate ${est.Id}:`, err);
    }
  }
  return written;
}

// === Purchase Orders ===

export async function persistPurchaseOrdersToDb(orgId: string, qbPOs: QBPurchaseOrder[]): Promise<number> {
  let written = 0;
  const now = new Date();
  const vendMap = await vendorIdMap(orgId);

  for (const po of qbPOs) {
    if (!po.Id) continue;
    const localVendorId = vendMap.get(po.VendorRef?.value || '');
    if (!localVendorId) {
      console.warn(`Skipping PO ${po.Id}: vendor ${po.VendorRef?.value} not in local DB`);
      continue;
    }

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

    const values = {
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
    };

    try {
      const [row] = await db
        .insert(purchaseOrders)
        .values(values)
        .onConflictDoUpdate({
          target: purchaseOrders.qbPurchaseOrderId,
          set: {
            vendorId: values.vendorId,
            poNumber: values.poNumber,
            status: values.status,
            issueDate: values.issueDate,
            expectedDate: values.expectedDate,
            subtotal: values.subtotal,
            taxAmount: values.taxAmount,
            totalAmount: values.totalAmount,
            shipAddress: values.shipAddress,
            vendorMessage: values.vendorMessage,
            privateNote: values.privateNote,
            emailStatus: values.emailStatus,
            lastSyncedAt: now,
            updatedAt: now,
          },
        })
        .returning({ id: purchaseOrders.id });

      await db.delete(purchaseOrderLineItems).where(eq(purchaseOrderLineItems.purchaseOrderId, row.id));
      const lineValues = lineRows.map((l, idx) => {
        const itemDetail = l.ItemBasedExpenseLineDetail;
        const acctDetail = l.AccountBasedExpenseLineDetail;
        return {
          purchaseOrderId: row.id,
          qbItemId: itemDetail?.ItemRef?.value,
          qbAccountId: acctDetail?.AccountRef?.value,
          description: l.Description || itemDetail?.ItemRef?.name || acctDetail?.AccountRef?.name || 'Item',
          quantity: String(itemDetail?.Qty ?? 1),
          unitCost: String(itemDetail?.UnitPrice ?? l.Amount ?? 0),
          total: String(l.Amount ?? 0),
          order: l.LineNum ?? idx + 1,
        };
      });
      if (lineValues.length > 0) await db.insert(purchaseOrderLineItems).values(lineValues);
      written++;
    } catch (err) {
      console.error(`Failed to persist PO ${po.Id}:`, err);
    }
  }
  return written;
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
  let written = 0;
  const now = new Date();
  const vendMap = await vendorIdMap(orgId);
  const custMap = await customerIdMap(orgId);

  for (const bill of qbBills) {
    if (!bill.Id) continue;
    const localVendorId = vendMap.get(bill.VendorRef?.value || '');
    if (!localVendorId) {
      console.warn(`Skipping bill ${bill.Id}: vendor ${bill.VendorRef?.value} not in local DB`);
      continue;
    }

    const lineRows = (bill.Line || []).filter(
      (l) => l.DetailType === 'ItemBasedExpenseLineDetail' || l.DetailType === 'AccountBasedExpenseLineDetail'
    );
    const subtotal = lineRows.reduce((sum, l) => sum + (l.Amount || 0), 0);
    const taxAmount = bill.TxnTaxDetail?.TotalTax ?? 0;
    const totalAmount = bill.TotalAmt ?? subtotal + taxAmount;
    const balance = bill.Balance ?? totalAmount;

    const values = {
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
    };

    try {
      const [row] = await db
        .insert(bills)
        .values(values)
        .onConflictDoUpdate({
          target: bills.qbBillId,
          set: {
            vendorId: values.vendorId,
            billNumber: values.billNumber,
            status: values.status,
            issueDate: values.issueDate,
            dueDate: values.dueDate,
            subtotal: values.subtotal,
            taxAmount: values.taxAmount,
            totalAmount: values.totalAmount,
            balance: values.balance,
            privateNote: values.privateNote,
            paymentTerms: values.paymentTerms,
            lastSyncedAt: now,
            updatedAt: now,
          },
        })
        .returning({ id: bills.id });

      await db.delete(billLineItems).where(eq(billLineItems.billId, row.id));
      const lineValues = lineRows.map((l, idx) => {
        const itemDetail = l.ItemBasedExpenseLineDetail;
        const acctDetail = l.AccountBasedExpenseLineDetail;
        const billable = (itemDetail?.BillableStatus || acctDetail?.BillableStatus) === 'Billable';
        const customerRef = itemDetail?.CustomerRef?.value || acctDetail?.CustomerRef?.value;
        return {
          billId: row.id,
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
      if (lineValues.length > 0) await db.insert(billLineItems).values(lineValues);
      written++;
    } catch (err) {
      console.error(`Failed to persist bill ${bill.Id}:`, err);
    }
  }
  return written;
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
