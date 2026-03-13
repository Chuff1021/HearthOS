import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";
import { getInvoices as getLocalInvoices } from "@/lib/data-store";
import { getOrCreateDefaultOrg } from "@/lib/org";
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

    const localInvoices = getLocalInvoices()
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

    let quickbooksInvoices: Array<Record<string, unknown>> = [];
    let quickbooksEstimates: Array<Record<string, unknown>> = [];

    let accessToken = request.cookies.get("qb_access_token")?.value;
    let refreshToken = request.cookies.get("qb_refresh_token")?.value;
    let realmId = request.cookies.get("qb_realm_id")?.value;

    if (!accessToken || !refreshToken || !realmId) {
      const org = await getOrCreateDefaultOrg();
      accessToken = org.qbAccessToken || undefined;
      refreshToken = org.qbRefreshToken || undefined;
      realmId = org.qbRealmId || undefined;
    }

    if (accessToken && refreshToken && realmId) {
      const client = getClientFromTokens(accessToken, refreshToken, realmId);
      const [invoices, estimates] = await Promise.all([
        client.getInvoicesForCustomer(job.customerId, 200).catch(() => []),
        client.getEstimates(300).catch(() => []),
      ]);

      quickbooksInvoices = invoices
        .filter((invoice: any) =>
          invoice.Id === job.linkedInvoiceId ||
          invoice.DocNumber === job.linkedDocumentNumber ||
          normalize(invoice.CustomerRef?.value) === normalize(job.customerId)
        )
        .map((invoice: any) => ({
          id: invoice.Id,
          invoiceNumber: invoice.DocNumber || invoice.Id,
          txnDate: invoice.TxnDate,
          dueDate: invoice.DueDate,
          totalAmount: Number(invoice.TotalAmt || 0),
          balance: Number(invoice.Balance || 0),
          linked: invoice.Id === job.linkedInvoiceId || invoice.DocNumber === job.linkedDocumentNumber,
        }));

      quickbooksEstimates = estimates
        .filter((estimate: any) =>
          estimate.Id === job.linkedEstimateId ||
          estimate.DocNumber === job.linkedDocumentNumber ||
          normalize(estimate.CustomerRef?.value) === normalize(job.customerId)
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
        localInvoices,
        quickbooksInvoices,
        quickbooksEstimates,
      },
    });
  } catch (error) {
    console.error("Failed to get job context:", error);
    return NextResponse.json({ error: "Failed to get job context" }, { status: 500 });
  }
}
