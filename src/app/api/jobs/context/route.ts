import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, invoices as dbInvoices, payments } from "@/db";
import { getJob } from "@/lib/job-store";
import { getInvoices as getLocalInvoices } from "@/lib/data-store";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { authorizeApi } from "@/lib/tenant/api-authorization";
import { getClientFromTokens } from "@/lib/quickbooks/sync";

function normalize(value: string | undefined | null) {
  return (value || "").trim().toLowerCase();
}

function matchesTitle(jobTitle: string, candidate: string) {
  const title = normalize(jobTitle);
  const value = normalize(candidate);
  if (!title || !value) return false;
  return value.includes(title) || title.includes(value);
}

export async function GET(request: NextRequest) {
  const denied = await authorizeApi("jobs:read");
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const org = await getOrCreateDefaultOrg();

    const localInvoices = (await getLocalInvoices())
      .filter((invoice) =>
        invoice.customerId === job.customerId ||
        normalize(invoice.customerName) === normalize(job.customerName) ||
        matchesTitle(job.title, invoice.jobTitle)
      )
      .map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        status: invoice.status,
        totalAmount: invoice.totalAmount,
        balance: invoice.balance,
        jobTitle: invoice.jobTitle,
      }))
      .sort((a, b) => +new Date(b.issueDate) - +new Date(a.issueDate));

    const databaseInvoices = job.customerId
      ? await db
          .select({
            id: dbInvoices.id,
            qbInvoiceId: dbInvoices.qbInvoiceId,
            invoiceNumber: dbInvoices.invoiceNumber,
            issueDate: dbInvoices.issueDate,
            dueDate: dbInvoices.dueDate,
            status: dbInvoices.status,
            totalAmount: dbInvoices.totalAmount,
            balance: dbInvoices.balance,
          })
          .from(dbInvoices)
          .where(and(eq(dbInvoices.orgId, org.id), eq(dbInvoices.customerId, job.customerId)))
          .orderBy(desc(dbInvoices.issueDate))
      : [];

    const databasePayments = databaseInvoices.length
      ? await db
          .select({
            id: payments.id,
            invoiceId: payments.invoiceId,
            invoiceNumber: dbInvoices.invoiceNumber,
            amount: payments.amount,
            paymentMethod: payments.paymentMethod,
            paidAt: payments.paidAt,
            qbPaymentId: payments.qbPaymentId,
            transactionId: payments.transactionId,
            notes: payments.notes,
          })
          .from(payments)
          .innerJoin(dbInvoices, eq(dbInvoices.id, payments.invoiceId))
          .where(and(
            eq(payments.orgId, org.id),
            job.linkedInvoiceId
              ? eq(payments.invoiceId, job.linkedInvoiceId)
              : eq(dbInvoices.issueDate, job.scheduledDate),
          ))
          .orderBy(desc(payments.paidAt))
      : [];

    const quickbooksInvoices: Array<Record<string, unknown>> = databaseInvoices
      .filter((invoice) => Boolean(invoice.qbInvoiceId))
      .map((invoice) => ({
        id: invoice.qbInvoiceId,
        invoiceNumber: invoice.invoiceNumber,
        txnDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        totalAmount: Number(invoice.totalAmount || 0),
        balance: Number(invoice.balance || 0),
        linked:
          invoice.id === job.linkedInvoiceId ||
          invoice.qbInvoiceId === job.linkedInvoiceId ||
          invoice.invoiceNumber === job.linkedDocumentNumber,
      }));
    let quickbooksEstimates: Array<Record<string, unknown>> = [];

    let accessToken = request.cookies.get("qb_access_token")?.value;
    let refreshToken = request.cookies.get("qb_refresh_token")?.value;
    let realmId = request.cookies.get("qb_realm_id")?.value;

    if (!accessToken || !refreshToken || !realmId) {
      accessToken = org.qbAccessToken || undefined;
      refreshToken = org.qbRefreshToken || undefined;
      realmId = org.qbRealmId || undefined;
    }

    if (accessToken && refreshToken && realmId && job.linkedEstimateId) {
      const client = getClientFromTokens(accessToken, refreshToken, realmId);
      const estimates = await client.getEstimates(300).catch(() => []);

      quickbooksEstimates = estimates
        .filter((estimate: any) =>
          estimate.Id === job.linkedEstimateId ||
          estimate.DocNumber === job.linkedDocumentNumber
        )
        .map((estimate: any) => ({
          id: estimate.Id,
          estimateNumber: estimate.DocNumber || estimate.Id,
          txnDate: estimate.TxnDate,
          expirationDate: estimate.ExpirationDate,
          totalAmount: Number(estimate.TotalAmt || 0),
          linked: estimate.Id === job.linkedEstimateId || estimate.DocNumber === job.linkedDocumentNumber,
        }));
    }

    return NextResponse.json({
      job,
      related: {
        localInvoices: [
          ...databaseInvoices.map((invoice) => ({
            ...invoice,
            totalAmount: Number(invoice.totalAmount || 0),
            balance: Number(invoice.balance || 0),
            linked:
              invoice.id === job.linkedInvoiceId ||
              invoice.qbInvoiceId === job.linkedInvoiceId ||
              invoice.invoiceNumber === job.linkedDocumentNumber,
          })),
          ...localInvoices.filter(
            (invoice) => !databaseInvoices.some((databaseInvoice) => databaseInvoice.invoiceNumber === invoice.invoiceNumber),
          ),
        ],
        quickbooksInvoices,
        quickbooksEstimates,
        payments: databasePayments.map((payment) => ({
          ...payment,
          amount: Number(payment.amount || 0),
        })),
      },
    });
  } catch (error) {
    console.error("Failed to get job context:", error);
    return NextResponse.json({ error: "Failed to get job context" }, { status: 500 });
  }
}
