import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';
import postgres from 'postgres';

export interface Customer {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: {
    line1: string;
    city: string;
    state: string;
    zip: string;
  };
  balance: number;
  active: boolean;
  tags: string[];
  totalJobs: number;
  totalRevenue: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  jobNumber?: string;
  jobTitle: string;
  issueDate: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  balance: number;
  lineItems: InvoiceLineItem[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

function recalculateInvoice(invoice: Invoice): Invoice {
  const lineItems = (invoice.lineItems || []).map((line) => {
    const qty = Number(line.qty || 0);
    const unitPrice = Number(line.unitPrice || 0);
    return {
      ...line,
      qty,
      unitPrice,
      total: qty * unitPrice,
    };
  });

  const subtotal = lineItems.reduce((sum, line) => sum + line.total, 0);
  const taxRate = Number(invoice.taxRate || 0);
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;
  const alreadyPaid = Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.balance || 0));
  const balance = invoice.status === 'paid' ? 0 : Math.max(0, totalAmount - alreadyPaid);

  return {
    ...invoice,
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    totalAmount,
    balance,
  };
}

type Store = {
  customers: Customer[];
  invoices: Invoice[];
  nextInvoiceNum: number;
  nextCustomerNum: number;
};

const FILE = 'core-data-store.json';
const STORE_KEY = 'core';
let sqlClient: ReturnType<typeof postgres> | null = null;
let initPromise: Promise<void> | null = null;

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    null
  );
}

function getSql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) return null;
  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return sqlClient;
}

async function ensureTable() {
  const sql = getSql();
  if (!sql) return;

  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        create table if not exists hearth_core_data_store (
          key text primary key,
          payload jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
      `;
    })();
  }

  await initPromise;
}

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

function emptyStore(): Store {
  return {
    customers: [],
    invoices: [],
    nextInvoiceNum: 1000,
    nextCustomerNum: 1,
  };
}

function normalizeStore(raw: Store | string | null | undefined): Store {
  const store = typeof raw === 'string'
    ? (() => {
        try {
          return JSON.parse(raw) as Store;
        } catch {
          return emptyStore();
        }
      })()
    : raw || emptyStore();

  if (typeof store.nextInvoiceNum !== 'number') store.nextInvoiceNum = 1000;
  if (typeof store.nextCustomerNum !== 'number') store.nextCustomerNum = 1;
  if (!Array.isArray(store.customers)) store.customers = [];
  if (!Array.isArray(store.invoices)) store.invoices = [];
  return store;
}

function loadFileStore(): Store {
  return normalizeStore(readJsonFile<Store>(FILE, emptyStore()));
}

function saveFileStore(store: Store) {
  writeJsonFileWithBackup(FILE, store);
}

async function loadStore(): Promise<Store> {
  const sql = getSql();
  if (!sql) {
    if (process.env.VERCEL === '1') {
      throw new Error('DATABASE_URL is required for durable customer/invoice storage on Vercel');
    }
    return loadFileStore();
  }

  await ensureTable();
  const rows = await sql<{ payload: Store }[]>`
    select payload
    from hearth_core_data_store
    where key = ${STORE_KEY}
    limit 1
  `;

  if (rows[0]?.payload) return normalizeStore(rows[0].payload);

  const seed = loadFileStore();
  await sql`
    insert into hearth_core_data_store (key, payload)
    values (${STORE_KEY}, ${JSON.stringify(seed)}::jsonb)
    on conflict (key) do nothing
  `;
  return seed;
}

async function saveStore(store: Store) {
  const normalized = normalizeStore(store);
  const sql = getSql();
  if (!sql) {
    if (process.env.VERCEL === '1') {
      throw new Error('DATABASE_URL is required for durable customer/invoice storage on Vercel');
    }
    saveFileStore(normalized);
    return;
  }

  await ensureTable();
  await sql`
    insert into hearth_core_data_store (key, payload, updated_at)
    values (${STORE_KEY}, ${JSON.stringify(normalized)}::jsonb, now())
    on conflict (key) do update set
      payload = excluded.payload,
      updated_at = now()
  `;
}

export async function getCustomers(): Promise<Customer[]> {
  return (await loadStore()).customers;
}

export async function getCustomerById(id: string): Promise<Customer | undefined> {
  return (await loadStore()).customers.find((c) => c.id === id);
}

export async function searchCustomersLocal(query: string): Promise<Customer[]> {
  const customers = await getCustomers();
  return customers.filter(
    (c) =>
      matchesSearchQuery(query, c.displayName) ||
      matchesSearchQuery(query, c.email) ||
      matchesSearchQuery(query, c.phone) ||
      matchesSearchQuery(query, c.companyName)
  );
}

export async function createCustomer(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'totalJobs' | 'totalRevenue' | 'balance'>): Promise<Customer> {
  const store = await loadStore();
  const customer: Customer = {
    ...data,
    id: `cust-${String(store.nextCustomerNum++).padStart(3, '0')}`,
    balance: 0,
    totalJobs: 0,
    totalRevenue: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.customers.push(customer);
  await saveStore(store);
  return customer;
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<Customer | null> {
  const store = await loadStore();
  const idx = store.customers.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  store.customers[idx] = { ...store.customers[idx], ...data, updatedAt: new Date().toISOString() };
  await saveStore(store);
  return store.customers[idx];
}

export async function deleteCustomer(id: string): Promise<boolean> {
  const store = await loadStore();
  const idx = store.customers.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.customers.splice(idx, 1);
  await saveStore(store);
  return true;
}

export async function getInvoices(): Promise<Invoice[]> {
  return (await loadStore()).invoices;
}

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
  return (await loadStore()).invoices.find((i) => i.id === id);
}

export async function getInvoicesForCustomer(customerId: string): Promise<Invoice[]> {
  return (await getInvoices()).filter((i) => i.customerId === customerId);
}

export async function createInvoice(data: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt'>): Promise<Invoice> {
  const store = await loadStore();
  const invoice: Invoice = recalculateInvoice({
    ...data,
    id: `inv-${String(store.invoices.length + 1).padStart(3, '0')}`,
    invoiceNumber: `INV-${new Date().getFullYear()}-${String(store.nextInvoiceNum++).padStart(4, '0')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store.invoices.unshift(invoice);
  await saveStore(store);
  return invoice;
}

export async function updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice | null> {
  const store = await loadStore();
  const idx = store.invoices.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  store.invoices[idx] = recalculateInvoice({ ...store.invoices[idx], ...data, updatedAt: new Date().toISOString() });
  await saveStore(store);
  return store.invoices[idx];
}

export async function deleteInvoice(id: string): Promise<boolean> {
  const store = await loadStore();
  const idx = store.invoices.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  store.invoices.splice(idx, 1);
  await saveStore(store);
  return true;
}

export async function getDashboardStats() {
  const store = await loadStore();
  const { customers, invoices } = store;
  const totalCustomers = customers.filter((c) => c.active).length;
  const totalOutstanding = invoices.filter((i) => i.balance > 0).reduce((sum, i) => sum + i.balance, 0);
  const totalOverdue = invoices.filter((i) => i.status === 'overdue').reduce((sum, i) => sum + i.balance, 0);
  const paidThisMonth = invoices.filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.totalAmount, 0);
  const draftCount = invoices.filter((i) => i.status === 'draft').length;
  const sentCount = invoices.filter((i) => i.status === 'sent').length;
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;
  const totalRevenue = invoices.reduce((sum, i) => sum + i.totalAmount, 0);

  return {
    totalCustomers,
    totalOutstanding,
    totalOverdue,
    paidThisMonth,
    draftCount,
    sentCount,
    overdueCount,
    totalRevenue,
    totalInvoices: invoices.length,
  };
}
