// Data transformation utilities: QuickBooks API → UI format

import type { QBCustomer, QBInvoice, QBInvoiceLine } from './types';

/**
 * Transform QuickBooks Customer to UI format
 */
export function transformCustomer(qbCustomer: QBCustomer) {
  return {
    id: qbCustomer.Id,
    displayName: qbCustomer.DisplayName,
    firstName: qbCustomer.GivenName || '',
    lastName: qbCustomer.FamilyName || '',
    companyName: qbCustomer.CompanyName,
    email: qbCustomer.PrimaryEmailAddr?.Address,
    phone: qbCustomer.PrimaryPhone?.FreeFormNumber,
    address: qbCustomer.BillAddr ? {
      line1: qbCustomer.BillAddr.Line1 || '',
      city: qbCustomer.BillAddr.City || '',
      state: qbCustomer.BillAddr.CountrySubDivisionCode || '',
      zip: qbCustomer.BillAddr.PostalCode || '',
    } : undefined,
    balance: qbCustomer.Balance || 0,
    active: qbCustomer.Active !== false,
    tags: [] as string[],
    totalJobs: 0,
    totalRevenue: 0,
    notes: undefined,
    createdAt: qbCustomer.CreatedTime,
    updatedAt: qbCustomer.LastUpdatedTime,
  };
}

/**
 * Transform QuickBooks Invoice Line to UI format
 */
function transformInvoiceLine(line: QBInvoiceLine, index: number) {
  const itemName = line.SalesItemLineDetail?.ItemRef?.name;
  return {
    id: line.Id || `line-${index}`,
    description: line.Description || itemName || 'Item',
    itemId: line.SalesItemLineDetail?.ItemRef?.value,
    itemName,
    partNumber: itemName,
    qty: line.SalesItemLineDetail?.Qty || 1,
    unitPrice: line.SalesItemLineDetail?.UnitPrice || (line.Amount || 0),
    total: line.Amount || 0,
  };
}

function isEditableInvoiceLine(line: QBInvoiceLine) {
  return line.DetailType === "SalesItemLineDetail" || line.DetailType === "DescriptionOnly";
}

/**
 * Transform QuickBooks Invoice to UI format
 */
export function transformInvoice(qbInvoice: QBInvoice) {
  const editableLines = (qbInvoice.Line || []).filter(isEditableInvoiceLine);
  const lineItems = editableLines.map((line, index) => transformInvoiceLine(line, index));
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  
  // Calculate tax (QuickBooks may or may not have TxnTaxDetail)
  const taxAmount = qbInvoice.TxnTaxDetail?.TotalTax || 0;
  const totalAmount = qbInvoice.TotalAmt || subtotal + taxAmount;
  
  // Determine status from QuickBooks data
  let status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void' = 'sent';
  if (qbInvoice.Balance === 0) {
    status = 'paid';
  } else if (qbInvoice.EmailStatus === 'NotSet') {
    status = 'draft';
  } else if (qbInvoice.DueDate) {
    const dueDate = new Date(qbInvoice.DueDate);
    if (dueDate < new Date() && qbInvoice.Balance > 0) {
      status = 'overdue';
    }
  }

  return {
    id: qbInvoice.Id,
    invoiceNumber: qbInvoice.DocNumber || qbInvoice.Id,
    customerId: qbInvoice.CustomerRef?.value || '',
    customerName: qbInvoice.CustomerRef?.name || 'Unknown Customer',
    jobNumber: undefined,
    jobTitle: lineItems[0]?.description || 'Invoice',
    issueDate: qbInvoice.TxnDate,
    dueDate: qbInvoice.DueDate || qbInvoice.TxnDate,
    status,
    subtotal,
    taxRate: taxAmount > 0 && subtotal > 0 ? (taxAmount / subtotal) * 100 : 0,
    taxAmount,
    totalAmount,
    balance: qbInvoice.Balance || 0,
    lineItems,
    notes: qbInvoice.PrivateNote,
    createdAt: qbInvoice.CreatedTime,
    updatedAt: qbInvoice.LastUpdatedTime,
  };
}

/**
 * Transform array of QuickBooks customers
 */
export function transformCustomers(qbCustomers: QBCustomer[]) {
  return qbCustomers.map(transformCustomer);
}

/**
 * Transform array of QuickBooks invoices
 */
export function transformInvoices(qbInvoices: QBInvoice[]) {
  return qbInvoices.map(transformInvoice);
}
