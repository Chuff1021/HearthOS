import type { QBCustomer, QBItem, QBInvoice, QBPayment, QBSyncStatus, QBSyncLog, QBVendor } from './types';
import { QuickBooksClient, createQuickBooksClient } from './client';
import { db, customers, inventoryItems, vendors } from '@/db';
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

    // Sync invoices
    try {
      invoicesCache = await client.getInvoices();
      syncStatus.recordsSynced.invoices = invoicesCache.length;
      addLog('invoices', 'import', invoicesCache.length, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('invoices', 'import', 0, 'error', error);
      console.error('Failed to sync invoices:', err);
    }

    // Sync payments
    try {
      paymentsCache = await client.getPayments();
      syncStatus.recordsSynced.payments = paymentsCache.length;
      addLog('payments', 'import', paymentsCache.length, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('payments', 'import', 0, 'error', error);
      console.error('Failed to sync payments:', err);
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
