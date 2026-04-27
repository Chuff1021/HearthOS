import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, organizations } from "@/db";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { getCustomerById as getLocalCustomerById, getInvoices as getLocalInvoices } from "@/lib/data-store";
import { getClientFromTokens } from "@/lib/quickbooks/sync";
import { transformCustomer, transformInvoice } from "@/lib/quickbooks/transform";
import type { QBCustomer, QBPayment } from "@/lib/quickbooks/types";

type CustomerProfile = {
  customer: {
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
  };
  history: {
    invoices: Array<ReturnType<typeof transformInvoice>>;
    estimates: Array<{
      id: string;
      estimateNumber: string;
      txnDate?: string;
      expirationDate?: string;
      totalAmt: number;
    }>;
    localInvoices: Array<{
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
      lineItems: Array<{ id: string; description: string; qty: number; unitPrice: number; total: number }>;
      notes?: string;
      createdAt: string;
      updatedAt: string;
    }>;
    payments: Array<{
      id: string;
      txnDate: string;
      totalAmt: number;
      unappliedAmt: number;
      paymentMethod?: string;
      linkedTxnIds: string[];
    }>;
    purchaseOrders: Array<{
      id: string;
      docNumber: string;
      txnDate?: string;
      vendorId?: string;
      vendorName?: string;
      totalAmt: number;
      memo?: string;
    }>;
  };
  summary: {
    quickbooksInvoiceCount: number;
    quickbooksEstimateCount: number;
    quickbooksPaymentCount: number;
    purchaseOrderCount: number;
    localInvoiceCount: number;
    totalRevenue: number;
    outstandingBalance: number;
    totalPaid: number;
  };
  source: "quickbooks" | "local";
};

async function getQBAuthFromRequest(request: NextRequest) {
  let accessToken = request.cookies.get("qb_access_token")?.value;
  let refreshToken = request.cookies.get("qb_refresh_token")?.value;
  let realmId = request.cookies.get("qb_realm_id")?.value;

  const org = await getOrCreateDefaultOrg();

  if (!accessToken || !refreshToken || !realmId) {
    if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
      accessToken = org.qbAccessToken;
      refreshToken = org.qbRefreshToken;
      realmId = org.qbRealmId;
    }
  }

  if (!accessToken || !refreshToken || !realmId) {
    return { ok: false as const, error: "Not connected to QuickBooks" };
  }

  return {
    ok: true as const,
    accessToken,
    refreshToken,
    realmId,
    orgId: org.id,
  };
}

async function withRefresh<T>(
  request: NextRequest,
  fn: (client: ReturnType<typeof getClientFromTokens>) => Promise<T>
) {
  const auth = await getQBAuthFromRequest(request);
  if (!auth.ok) {
    throw new Error(auth.error);
  }

  let client = getClientFromTokens(auth.accessToken, auth.refreshToken, auth.realmId);

  try {
    return await fn(client);
  } catch (error) {
    const tokens = await client.refreshAccessToken();
    await db
      .update(organizations)
      .set({
        qbAccessToken: tokens.access_token,
        qbRefreshToken: tokens.refresh_token,
        qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, auth.orgId));

    client = getClientFromTokens(tokens.access_token, tokens.refresh_token, auth.realmId);
    return await fn(client);
  }
}

function normalize(value: string | undefined | null): string {
  return (value || "").trim().toLowerCase();
}

function includesNormalized(haystack: string | undefined | null, needle: string) {
  return normalize(haystack).includes(needle);
}

function getCustomerNeedles(customer: QBCustomer) {
  return [
    customer.Id,
    customer.DisplayName,
    customer.CompanyName,
    customer.GivenName,
    customer.FamilyName,
    customer.PrimaryEmailAddr?.Address,
    customer.PrimaryPhone?.FreeFormNumber,
  ]
    .map((value) => normalize(value))
    .filter(Boolean);
}

function matchPurchaseOrderToCustomer(purchaseOrder: any, customer: QBCustomer) {
  const fields = [
    purchaseOrder?.Memo,
    purchaseOrder?.PrivateNote,
    purchaseOrder?.CustomerMemo?.value,
    purchaseOrder?.DocNumber,
    purchaseOrder?.VendorRef?.name,
    ...(Array.isArray(purchaseOrder?.Line)
      ? purchaseOrder.Line.flatMap((line: any) => [line?.Description, line?.ItemBasedExpenseLineDetail?.CustomerRef?.name])
      : []),
  ]
    .map((value) => normalize(typeof value === "string" ? value : undefined))
    .filter(Boolean);

  if (!fields.length) return false;

  const customerNeedles = getCustomerNeedles(customer);
  return customerNeedles.some((needle) => needle.length > 2 && fields.some((field) => field.includes(needle)));
}

function transformPayment(payment: QBPayment) {
  const rawPaymentMethod = payment.PaymentMethodRef?.name || "";
  const normalizedPaymentMethod = /cash/i.test(rawPaymentMethod)
    ? "Cash"
    : /check/i.test(rawPaymentMethod)
      ? "Check"
      : /(visa|mastercard|amex|american express|discover|credit|card)/i.test(rawPaymentMethod)
        ? "Credit Card"
        : rawPaymentMethod || undefined;
  return {
    id: payment.Id,
    txnDate: payment.TxnDate,
    totalAmt: Number(payment.TotalAmt || 0),
    unappliedAmt: Number(payment.UnappliedAmt || 0),
    paymentMethod: normalizedPaymentMethod,
    linkedTxnIds: Array.isArray(payment.Line)
      ? payment.Line.flatMap((line) => {
          const linked = line.LinkedTxn;
          if (Array.isArray(linked)) return linked.map((txn) => txn.TxnId);
          if (linked?.TxnId) return [linked.TxnId];
          return [];
        })
      : [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const localCustomer = getLocalCustomerById(id);
    const localInvoices = getLocalInvoices()
      .filter((invoice) => invoice.customerId === id || normalize(invoice.customerName) === normalize(localCustomer?.displayName))
      .sort((a, b) => +new Date(b.issueDate) - +new Date(a.issueDate));

    try {
      const profile = await withRefresh(request, async (client) => {
        const qbCustomer = await client.getCustomer(id);
        const [qbInvoices, qbPayments, purchaseOrders, qbEstimates] = await Promise.all([
          client.getInvoicesForCustomer(qbCustomer.Id),
          client.getPaymentsForCustomer(qbCustomer.Id),
          client.getPurchaseOrders(500),
          client.getEstimates(500),
        ]);

        const transformedCustomer = transformCustomer(qbCustomer);
        const transformedInvoices = qbInvoices.map(transformInvoice);
        const transformedPayments = qbPayments.map(transformPayment);
        const transformedEstimates = qbEstimates
          .filter((estimate: any) => estimate?.CustomerRef?.value === qbCustomer.Id)
          .map((estimate: any) => ({
            id: estimate.Id,
            estimateNumber: estimate.DocNumber || estimate.Id,
            txnDate: estimate.TxnDate,
            expirationDate: estimate.ExpirationDate,
            totalAmt: Number(estimate.TotalAmt || 0),
          }));
        const relatedPurchaseOrders = purchaseOrders
          .filter((purchaseOrder: any) => matchPurchaseOrderToCustomer(purchaseOrder, qbCustomer))
          .map((purchaseOrder: any) => ({
            id: purchaseOrder.Id,
            docNumber: purchaseOrder.DocNumber || `PO ${purchaseOrder.Id}`,
            txnDate: purchaseOrder.TxnDate,
            vendorId: purchaseOrder.VendorRef?.value,
            vendorName: purchaseOrder.VendorRef?.name,
            totalAmt: Number(purchaseOrder.TotalAmt || 0),
            memo: purchaseOrder.Memo || purchaseOrder.PrivateNote || purchaseOrder.CustomerMemo?.value,
          }))
          .sort((a, b) => +new Date(b.txnDate || 0) - +new Date(a.txnDate || 0));

        const totalRevenue = transformedInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
        const totalPaid = transformedPayments.reduce((sum, payment) => sum + Number(payment.totalAmt || 0), 0);

        const mergedCustomer = {
          ...transformedCustomer,
          tags: localCustomer?.tags || transformedCustomer.tags,
          notes: localCustomer?.notes || transformedCustomer.notes,
          totalJobs: localCustomer?.totalJobs || transformedCustomer.totalJobs,
          totalRevenue: Math.max(localCustomer?.totalRevenue || 0, totalRevenue),
        };

        const result: CustomerProfile = {
          customer: mergedCustomer,
          history: {
            invoices: transformedInvoices,
            estimates: transformedEstimates,
            localInvoices,
            payments: transformedPayments,
            purchaseOrders: relatedPurchaseOrders,
          },
          summary: {
            quickbooksInvoiceCount: transformedInvoices.length,
            quickbooksEstimateCount: transformedEstimates.length,
            quickbooksPaymentCount: transformedPayments.length,
            purchaseOrderCount: relatedPurchaseOrders.length,
            localInvoiceCount: localInvoices.length,
            totalRevenue: Math.max(localCustomer?.totalRevenue || 0, totalRevenue),
            outstandingBalance: Number(qbCustomer.Balance || 0),
            totalPaid,
          },
          source: "quickbooks",
        };

        return result;
      });

      return NextResponse.json(profile);
    } catch (error) {
      if (!localCustomer) {
        throw error;
      }

      const totalRevenue = localInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
      const totalPaid = localInvoices
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

      const fallback: CustomerProfile = {
        customer: {
          ...localCustomer,
          totalRevenue: Math.max(localCustomer.totalRevenue, totalRevenue),
        },
        history: {
          invoices: [],
          localInvoices,
          payments: [],
          estimates: [],
          purchaseOrders: [],
        },
        summary: {
          quickbooksInvoiceCount: 0,
          quickbooksEstimateCount: 0,
          quickbooksPaymentCount: 0,
          purchaseOrderCount: 0,
          localInvoiceCount: localInvoices.length,
          totalRevenue: Math.max(localCustomer.totalRevenue, totalRevenue),
          outstandingBalance: localCustomer.balance,
          totalPaid,
        },
        source: "local",
      };

      return NextResponse.json(fallback);
    }
  } catch (err) {
    console.error("Failed to get customer profile:", err);
    return NextResponse.json({ error: "Failed to get customer profile" }, { status: 500 });
  }
}
