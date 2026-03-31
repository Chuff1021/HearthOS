import type { QBCustomer, QBItem, QBInvoice, QBPayment, QBSyncStatus, QBSyncLog } from './types';
import { QuickBooksClient, createQuickBooksClient } from './client';

// In-memory sync status (in production, use database)
let syncStatus: QBSyncStatus = {
  lastSync: new Date(0),
  status: 'idle',
  recordsSynced: {
    customers: 0,
    items: 0,
    invoices: 0,
    payments: 0,
  },
};

// In-memory cache (in production, use database)
let customersCache: QBCustomer[] = [];
let itemsCache: QBItem[] = [];
let invoicesCache: QBInvoice[] = [];
let paymentsCache: QBPayment[] = [];

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

// Sync all data from QuickBooks
export async function syncAllFromQuickBooks(client: QuickBooksClient): Promise<QBSyncStatus> {
  if (syncStatus.status === 'syncing') {
    throw new Error('Sync already in progress');
  }

  syncStatus.status = 'syncing';
  syncStatus.error = undefined;

  try {
    // Sync customers
    try {
      customersCache = await client.getAllCustomers();
      syncStatus.recordsSynced.customers = customersCache.length;
      addLog('customers', 'import', customersCache.length, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('customers', 'import', 0, 'error', error);
      console.error('Failed to sync customers:', err);
    }

    // Sync items (products/services)
    try {
      itemsCache = await client.getItems();
      syncStatus.recordsSynced.items = itemsCache.length;
      addLog('items', 'import', itemsCache.length, 'success');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      addLog('items', 'import', 0, 'error', error);
      console.error('Failed to sync items:', err);
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
export async function syncCustomers(client: QuickBooksClient): Promise<QBCustomer[]> {
  customersCache = await client.getAllCustomers();
  syncStatus.recordsSynced.customers = customersCache.length;
  addLog('customers', 'import', customersCache.length, 'success');
  return customersCache;
}

export async function syncItems(client: QuickBooksClient): Promise<QBItem[]> {
  itemsCache = await client.getItems();
  syncStatus.recordsSynced.items = itemsCache.length;
  addLog('items', 'import', itemsCache.length, 'success');
  return itemsCache;
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
