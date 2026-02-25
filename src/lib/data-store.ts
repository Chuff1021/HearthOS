// In-memory data store for HearthOS
// Works without QuickBooks — provides demo data + full CRUD
// When QB is connected, data syncs from there instead

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
  status: "draft" | "sent" | "paid" | "overdue" | "void";
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

// ============ SEED DATA ============

const seedCustomers: Customer[] = [
  {
    id: "cust-001",
    displayName: "Linda Martinez",
    firstName: "Linda",
    lastName: "Martinez",
    email: "linda.martinez@email.com",
    phone: "(555) 234-5678",
    address: { line1: "1234 Oak Street", city: "Denver", state: "CO", zip: "80202" },
    balance: 270.00,
    active: true,
    tags: ["Residential", "Annual Plan"],
    totalJobs: 4,
    totalRevenue: 1250.00,
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-02-20T14:30:00Z",
  },
  {
    id: "cust-002",
    displayName: "Robert Chen",
    firstName: "Robert",
    lastName: "Chen",
    companyName: "Chen Properties LLC",
    email: "robert@chenproperties.com",
    phone: "(555) 345-6789",
    address: { line1: "5678 Maple Ave", city: "Boulder", state: "CO", zip: "80301" },
    balance: 4104.00,
    active: true,
    tags: ["Commercial", "New Install"],
    totalJobs: 2,
    totalRevenue: 6500.00,
    createdAt: "2024-01-20T09:00:00Z",
    updatedAt: "2024-02-25T11:00:00Z",
  },
  {
    id: "cust-003",
    displayName: "Patricia Williams",
    firstName: "Patricia",
    lastName: "Williams",
    email: "pat.williams@email.com",
    phone: "(555) 456-7890",
    address: { line1: "910 Pine Road", city: "Lakewood", state: "CO", zip: "80226" },
    balance: 0,
    active: true,
    tags: ["Residential", "Repeat Customer"],
    totalJobs: 7,
    totalRevenue: 3200.00,
    createdAt: "2023-09-10T08:00:00Z",
    updatedAt: "2024-02-24T16:00:00Z",
  },
  {
    id: "cust-004",
    displayName: "James Thompson",
    firstName: "James",
    lastName: "Thompson",
    companyName: "Thompson Realty",
    email: "james@thompsonrealty.com",
    phone: "(555) 567-8901",
    address: { line1: "2345 Elm Blvd", city: "Aurora", state: "CO", zip: "80012" },
    balance: 0,
    active: true,
    tags: ["Commercial", "Multi-Property"],
    totalJobs: 12,
    totalRevenue: 18500.00,
    createdAt: "2023-06-01T10:00:00Z",
    updatedAt: "2024-02-22T09:00:00Z",
  },
  {
    id: "cust-005",
    displayName: "Susan Park",
    firstName: "Susan",
    lastName: "Park",
    email: "susan.park@email.com",
    phone: "(555) 678-9012",
    address: { line1: "6789 Birch Lane", city: "Littleton", state: "CO", zip: "80120" },
    balance: 264.60,
    active: true,
    tags: ["Residential", "Pellet Stove"],
    totalJobs: 3,
    totalRevenue: 890.00,
    createdAt: "2023-11-15T14:00:00Z",
    updatedAt: "2024-02-10T10:00:00Z",
  },
  {
    id: "cust-006",
    displayName: "Michael Davis",
    firstName: "Michael",
    lastName: "Davis",
    email: "mdavis@email.com",
    phone: "(555) 789-0123",
    address: { line1: "3456 Cedar Court", city: "Arvada", state: "CO", zip: "80002" },
    balance: 0,
    active: true,
    tags: ["Residential", "Gas Fireplace"],
    totalJobs: 5,
    totalRevenue: 4200.00,
    createdAt: "2023-08-20T11:00:00Z",
    updatedAt: "2024-02-18T15:00:00Z",
  },
  {
    id: "cust-007",
    displayName: "Karen Wilson",
    firstName: "Karen",
    lastName: "Wilson",
    email: "karen.w@email.com",
    phone: "(555) 890-1234",
    address: { line1: "7890 Spruce Way", city: "Westminster", state: "CO", zip: "80031" },
    balance: 185.00,
    active: true,
    tags: ["Residential", "Wood Burning"],
    totalJobs: 2,
    totalRevenue: 550.00,
    createdAt: "2024-01-05T09:00:00Z",
    updatedAt: "2024-02-15T13:00:00Z",
  },
  {
    id: "cust-008",
    displayName: "David Rodriguez",
    firstName: "David",
    lastName: "Rodriguez",
    companyName: "Mountain View Hotels",
    email: "david@mountainviewhotels.com",
    phone: "(555) 901-2345",
    address: { line1: "1111 Mountain Rd", city: "Vail", state: "CO", zip: "81657" },
    balance: 0,
    active: true,
    tags: ["Commercial", "Hospitality", "VIP"],
    totalJobs: 15,
    totalRevenue: 42000.00,
    createdAt: "2023-03-01T10:00:00Z",
    updatedAt: "2024-02-20T08:00:00Z",
  },
];

const seedInvoices: Invoice[] = [
  {
    id: "inv-001",
    invoiceNumber: "INV-2024-0891",
    customerId: "cust-001",
    customerName: "Linda Martinez",
    jobNumber: "JOB-2024-0089",
    jobTitle: "Annual Cleaning & Inspection",
    issueDate: "2024-02-20",
    dueDate: "2024-03-20",
    status: "sent",
    subtotal: 250.00,
    taxRate: 8,
    taxAmount: 20.00,
    totalAmount: 270.00,
    balance: 270.00,
    lineItems: [
      { id: "li-001", description: "Annual Fireplace Cleaning", qty: 1, unitPrice: 185.00, total: 185.00 },
      { id: "li-002", description: "Safety Inspection", qty: 1, unitPrice: 65.00, total: 65.00 },
    ],
    createdAt: "2024-02-20T10:00:00Z",
    updatedAt: "2024-02-20T10:00:00Z",
  },
  {
    id: "inv-002",
    invoiceNumber: "INV-2024-0890",
    customerId: "cust-002",
    customerName: "Robert Chen",
    jobNumber: "JOB-2024-0090",
    jobTitle: "Gas Fireplace Installation",
    issueDate: "2024-02-25",
    dueDate: "2024-03-25",
    status: "draft",
    subtotal: 3800.00,
    taxRate: 8,
    taxAmount: 304.00,
    totalAmount: 4104.00,
    balance: 4104.00,
    lineItems: [
      { id: "li-003", description: "Napoleon GVFL60 Gas Fireplace Unit", qty: 1, unitPrice: 2400.00, total: 2400.00 },
      { id: "li-004", description: "Installation Labor (8 hrs)", qty: 8, unitPrice: 125.00, total: 1000.00 },
      { id: "li-005", description: "Gas Line Connection", qty: 1, unitPrice: 250.00, total: 250.00 },
      { id: "li-006", description: "Permits & Inspection", qty: 1, unitPrice: 150.00, total: 150.00 },
    ],
    createdAt: "2024-02-25T09:00:00Z",
    updatedAt: "2024-02-25T09:00:00Z",
  },
  {
    id: "inv-003",
    invoiceNumber: "INV-2024-0889",
    customerId: "cust-003",
    customerName: "Patricia Williams",
    jobNumber: "JOB-2024-0091",
    jobTitle: "Pilot Light Repair",
    issueDate: "2024-02-24",
    dueDate: "2024-03-24",
    status: "paid",
    subtotal: 165.00,
    taxRate: 8,
    taxAmount: 13.20,
    totalAmount: 178.20,
    balance: 0,
    lineItems: [
      { id: "li-007", description: "Pilot Light Repair - Labor (1.5 hrs)", qty: 1.5, unitPrice: 95.00, total: 142.50 },
      { id: "li-008", description: "Thermocouple Replacement", qty: 1, unitPrice: 22.50, total: 22.50 },
    ],
    createdAt: "2024-02-24T11:00:00Z",
    updatedAt: "2024-02-24T16:00:00Z",
  },
  {
    id: "inv-004",
    invoiceNumber: "INV-2024-0888",
    customerId: "cust-005",
    customerName: "Susan Park",
    jobNumber: "JOB-2024-0093",
    jobTitle: "Pellet Stove Service",
    issueDate: "2024-02-10",
    dueDate: "2024-03-10",
    status: "overdue",
    subtotal: 245.00,
    taxRate: 8,
    taxAmount: 19.60,
    totalAmount: 264.60,
    balance: 264.60,
    lineItems: [
      { id: "li-009", description: "Pellet Stove Annual Service", qty: 1, unitPrice: 195.00, total: 195.00 },
      { id: "li-010", description: "Auger Motor Replacement", qty: 1, unitPrice: 50.00, total: 50.00 },
    ],
    createdAt: "2024-02-10T10:00:00Z",
    updatedAt: "2024-02-10T10:00:00Z",
  },
  {
    id: "inv-005",
    invoiceNumber: "INV-2024-0887",
    customerId: "cust-004",
    customerName: "James Thompson",
    jobNumber: "JOB-2024-0094",
    jobTitle: "Multi-Unit Inspection (4 units)",
    issueDate: "2024-02-22",
    dueDate: "2024-03-22",
    status: "paid",
    subtotal: 520.00,
    taxRate: 8,
    taxAmount: 41.60,
    totalAmount: 561.60,
    balance: 0,
    lineItems: [
      { id: "li-011", description: "Commercial Fireplace Inspection", qty: 4, unitPrice: 95.00, total: 380.00 },
      { id: "li-012", description: "Carbon Monoxide Testing", qty: 4, unitPrice: 35.00, total: 140.00 },
    ],
    createdAt: "2024-02-22T08:00:00Z",
    updatedAt: "2024-02-23T14:00:00Z",
  },
  {
    id: "inv-006",
    invoiceNumber: "INV-2024-0886",
    customerId: "cust-006",
    customerName: "Michael Davis",
    jobNumber: "JOB-2024-0095",
    jobTitle: "Gas Valve Replacement",
    issueDate: "2024-02-18",
    dueDate: "2024-03-18",
    status: "sent",
    subtotal: 385.00,
    taxRate: 8,
    taxAmount: 30.80,
    totalAmount: 415.80,
    balance: 415.80,
    lineItems: [
      { id: "li-013", description: "Gas Valve Assembly", qty: 1, unitPrice: 210.00, total: 210.00 },
      { id: "li-014", description: "Labor (2 hrs)", qty: 2, unitPrice: 87.50, total: 175.00 },
    ],
    createdAt: "2024-02-18T15:00:00Z",
    updatedAt: "2024-02-18T15:00:00Z",
  },
  {
    id: "inv-007",
    invoiceNumber: "INV-2024-0885",
    customerId: "cust-007",
    customerName: "Karen Wilson",
    jobNumber: "JOB-2024-0096",
    jobTitle: "Chimney Sweep & Cap Install",
    issueDate: "2024-02-15",
    dueDate: "2024-03-15",
    status: "sent",
    subtotal: 350.00,
    taxRate: 8,
    taxAmount: 28.00,
    totalAmount: 378.00,
    balance: 185.00,
    lineItems: [
      { id: "li-015", description: "Full Chimney Sweep", qty: 1, unitPrice: 225.00, total: 225.00 },
      { id: "li-016", description: "Stainless Steel Chimney Cap", qty: 1, unitPrice: 125.00, total: 125.00 },
    ],
    notes: "Partial payment of $193 received 2/20",
    createdAt: "2024-02-15T13:00:00Z",
    updatedAt: "2024-02-20T10:00:00Z",
  },
  {
    id: "inv-008",
    invoiceNumber: "INV-2024-0884",
    customerId: "cust-008",
    customerName: "David Rodriguez",
    jobNumber: "JOB-2024-0097",
    jobTitle: "Hotel Lobby Fireplace Maintenance",
    issueDate: "2024-02-20",
    dueDate: "2024-03-20",
    status: "paid",
    subtotal: 1200.00,
    taxRate: 8,
    taxAmount: 96.00,
    totalAmount: 1296.00,
    balance: 0,
    lineItems: [
      { id: "li-017", description: "Commercial Gas Fireplace Service", qty: 3, unitPrice: 250.00, total: 750.00 },
      { id: "li-018", description: "Glass Panel Replacement", qty: 1, unitPrice: 180.00, total: 180.00 },
      { id: "li-019", description: "Decorative Media Refresh", qty: 3, unitPrice: 90.00, total: 270.00 },
    ],
    createdAt: "2024-02-20T08:00:00Z",
    updatedAt: "2024-02-21T16:00:00Z",
  },
];

// ============ DATA STORE ============

let customers: Customer[] = [...seedCustomers];
let invoices: Invoice[] = [...seedInvoices];
let nextInvoiceNum = 892;

// ============ CUSTOMER OPERATIONS ============

export function getCustomers(): Customer[] {
  return customers;
}

export function getCustomerById(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export function searchCustomersLocal(query: string): Customer[] {
  const q = query.toLowerCase();
  return customers.filter(
    (c) =>
      c.displayName.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(query) ||
      c.companyName?.toLowerCase().includes(q)
  );
}

export function createCustomer(data: Omit<Customer, "id" | "createdAt" | "updatedAt" | "totalJobs" | "totalRevenue" | "balance">): Customer {
  const customer: Customer = {
    ...data,
    id: `cust-${String(customers.length + 1).padStart(3, "0")}`,
    balance: 0,
    totalJobs: 0,
    totalRevenue: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  customers.push(customer);
  return customer;
}

export function updateCustomer(id: string, data: Partial<Customer>): Customer | null {
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  customers[idx] = { ...customers[idx], ...data, updatedAt: new Date().toISOString() };
  return customers[idx];
}

export function deleteCustomer(id: string): boolean {
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  customers.splice(idx, 1);
  return true;
}

// ============ INVOICE OPERATIONS ============

export function getInvoices(): Invoice[] {
  return invoices;
}

export function getInvoiceById(id: string): Invoice | undefined {
  return invoices.find((i) => i.id === id);
}

export function getInvoicesForCustomer(customerId: string): Invoice[] {
  return invoices.filter((i) => i.customerId === customerId);
}

export function createInvoice(data: Omit<Invoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt">): Invoice {
  const invoice: Invoice = {
    ...data,
    id: `inv-${String(invoices.length + 1).padStart(3, "0")}`,
    invoiceNumber: `INV-2024-${String(nextInvoiceNum++).padStart(4, "0")}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  invoices.unshift(invoice);
  return invoice;
}

export function updateInvoice(id: string, data: Partial<Invoice>): Invoice | null {
  const idx = invoices.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  invoices[idx] = { ...invoices[idx], ...data, updatedAt: new Date().toISOString() };
  return invoices[idx];
}

export function deleteInvoice(id: string): boolean {
  const idx = invoices.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  invoices.splice(idx, 1);
  return true;
}

// ============ DASHBOARD STATS ============

export function getDashboardStats() {
  const totalCustomers = customers.filter((c) => c.active).length;
  const totalOutstanding = invoices.filter((i) => i.balance > 0).reduce((sum, i) => sum + i.balance, 0);
  const totalOverdue = invoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + i.balance, 0);
  const paidThisMonth = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.totalAmount, 0);
  const draftCount = invoices.filter((i) => i.status === "draft").length;
  const sentCount = invoices.filter((i) => i.status === "sent").length;
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;
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
