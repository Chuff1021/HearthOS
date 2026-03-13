import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';

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

function loadStore(): Store {
  const store = readJsonFile<Store>(FILE, {
    customers: [],
    invoices: [],
    nextInvoiceNum: 1000,
    nextCustomerNum: 1,
  });

  if (typeof store.nextInvoiceNum !== 'number') store.nextInvoiceNum = 1000;
  if (typeof store.nextCustomerNum !== 'number') store.nextCustomerNum = 1;
  if (!Array.isArray(store.customers)) store.customers = [];
  if (!Array.isArray(store.invoices)) store.invoices = [];
  return store;
}

function saveStore(store: Store) {
  writeJsonFileWithBackup(FILE, store);
}

export function getCustomers(): Customer[] {
  return loadStore().customers;
}

export function getCustomerById(id: string): Customer | undefined {
  return loadStore().customers.find((c) => c.id === id);
}

export function searchCustomersLocal(query: string): Customer[] {
  return getCustomers().filter(
    (c) =>
      matchesSearchQuery(query, c.displayName) ||
      matchesSearchQuery(query, c.email) ||
      matchesSearchQuery(query, c.phone) ||
      matchesSearchQuery(query, c.companyName)
  );
}

export function createCustomer(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'totalJobs' | 'totalRevenue' | 'balance'>): Customer {
  const store = loadStore();
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
  saveStore(store);
  return customer;
}

export function updateCustomer(id: string, data: Partial<Customer>): Customer | null {
  const store = loadStore();
  const idx = store.customers.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  store.customers[idx] = { ...store.customers[idx], ...data, updatedAt: new Date().toISOString() };
  saveStore(store);
  return store.customers[idx];
}

export function deleteCustomer(id: string): boolean {
  const store = loadStore();
  const idx = store.customers.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.customers.splice(idx, 1);
  saveStore(store);
  return true;
}

export function getInvoices(): Invoice[] {
  return loadStore().invoices;
}

export function getInvoiceById(id: string): Invoice | undefined {
  return loadStore().invoices.find((i) => i.id === id);
}

export function getInvoicesForCustomer(customerId: string): Invoice[] {
  return getInvoices().filter((i) => i.customerId === customerId);
}

export function createInvoice(data: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt'>): Invoice {
  const store = loadStore();
  const invoice: Invoice = recalculateInvoice({
    ...data,
    id: `inv-${String(store.invoices.length + 1).padStart(3, '0')}`,
    invoiceNumber: `INV-${new Date().getFullYear()}-${String(store.nextInvoiceNum++).padStart(4, '0')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store.invoices.unshift(invoice);
  saveStore(store);
  return invoice;
}

export function updateInvoice(id: string, data: Partial<Invoice>): Invoice | null {
  const store = loadStore();
  const idx = store.invoices.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  store.invoices[idx] = recalculateInvoice({ ...store.invoices[idx], ...data, updatedAt: new Date().toISOString() });
  saveStore(store);
  return store.invoices[idx];
}

export function deleteInvoice(id: string): boolean {
  const store = loadStore();
  const idx = store.invoices.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  store.invoices.splice(idx, 1);
  saveStore(store);
  return true;
}

export function getDashboardStats() {
  const store = loadStore();
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
