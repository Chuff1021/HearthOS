import { NextRequest, NextResponse } from 'next/server';
import { 
  getCachedInvoices, 
  getInvoicesForCustomer,
  getOutstandingInvoices,
  getTotalOutstanding,
  syncInvoices,
  createInvoiceInQuickBooks,
  getClientFromTokens,
  getSyncStatus,
} from '@/lib/quickbooks/sync';
import { transformInvoices, transformInvoice } from '@/lib/quickbooks/transform';
import { getOrCreateDefaultOrg } from '@/lib/org';
import type { QBInvoice } from '@/lib/quickbooks/types';
import { addAuditLog } from '@/lib/audit-log-store';
import { isSmtpConfigured, parseEmailList, sendSmtpEmail } from '@/lib/email/smtp';
import { renderInvoicePdf } from '@/lib/invoices/pdf';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value: number | undefined) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function publicOrigin(request: NextRequest) {
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

function paymentUrl(request: NextRequest, invoice: QBInvoice) {
  const origin = publicOrigin(request);
  const balance = Number(invoice.Balance || invoice.TotalAmt || 0);
  const params = new URLSearchParams({
    amount: balance.toFixed(2),
    customer: invoice.CustomerRef?.name || 'Customer',
    invoice: invoice.DocNumber || invoice.Id,
  });
  if (invoice.BillEmail?.Address) params.set('email', invoice.BillEmail.Address);
  return `${origin}/pay?${params.toString()}`;
}

function invoiceEmailText(invoice: QBInvoice, payUrl: string) {
  const invoiceNumber = invoice.DocNumber || invoice.Id;
  const balance = Number(invoice.Balance || invoice.TotalAmt || 0);
  return [
    `Invoice ${invoiceNumber} from AARON'S FIREPLACE CO, LLC`,
    '',
    `Balance due: $${money(balance)}`,
    invoice.DueDate ? `Due date: ${invoice.DueDate}` : undefined,
    '',
    balance > 0 ? `Pay online: ${payUrl}` : undefined,
    '',
    'Thank you,',
    "AARON'S FIREPLACE CO, LLC",
  ].filter((part) => part !== undefined).join('\n');
}

function invoiceEmailHtml(invoice: QBInvoice, payUrl: string) {
  const invoiceNumber = invoice.DocNumber || invoice.Id;
  const balance = Number(invoice.Balance || invoice.TotalAmt || 0);
  const payButton = balance > 0
    ? `<p style="margin:22px 0;"><a href="${escapeHtml(payUrl)}" style="background:#f8971f;color:#111111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:6px;display:inline-block;">Pay invoice</a></p>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h1 style="font-size:22px;margin:0 0 6px;">Invoice ${escapeHtml(invoiceNumber)}</h1>
      <p style="margin:0 0 16px;color:#4b5563;">AARON'S FIREPLACE CO, LLC</p>
      <p style="margin:0 0 8px;">Balance due: <strong>$${money(balance)}</strong></p>
      ${invoice.DueDate ? `<p style="margin:0 0 8px;">Due date: ${escapeHtml(invoice.DueDate)}</p>` : ''}
      ${payButton}
      <p style="margin-top:22px;">The invoice PDF is attached.</p>
      <p style="margin-top:22px;">Thank you,<br />AARON'S FIREPLACE CO, LLC</p>
    </div>
  `;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const customerId = searchParams.get('customerId');
    const outstanding = searchParams.get('outstanding');
    const sync = searchParams.get('sync');
    const live = searchParams.get('live');
    let invoices = getCachedInvoices();

    // If sync requested, pull fresh data from QuickBooks
    if (sync === 'true' || live === 'true') {
      let accessToken = request.cookies.get('qb_access_token')?.value;
      let refreshToken = request.cookies.get('qb_refresh_token')?.value;
      let realmId = request.cookies.get('qb_realm_id')?.value;

      if (!accessToken || !refreshToken || !realmId) {
        const org = await getOrCreateDefaultOrg();
        if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
          accessToken = org.qbAccessToken;
          refreshToken = org.qbRefreshToken;
          realmId = org.qbRealmId;
        } else {
          return NextResponse.json(
            { error: 'Not connected to QuickBooks' },
            { status: 401 }
          );
        }
      }

      const client = getClientFromTokens(accessToken, refreshToken, realmId);
      invoices = await syncInvoices(client);
    }

    if (id) {
      let invoice = invoices.find((entry) => entry.Id === id || entry.DocNumber === id);
      if (!invoice) {
        let accessToken = request.cookies.get('qb_access_token')?.value;
        let refreshToken = request.cookies.get('qb_refresh_token')?.value;
        let realmId = request.cookies.get('qb_realm_id')?.value;

        if (!accessToken || !refreshToken || !realmId) {
          const org = await getOrCreateDefaultOrg();
          accessToken = org.qbAccessToken || undefined;
          refreshToken = org.qbRefreshToken || undefined;
          realmId = org.qbRealmId || undefined;
        }

        if (accessToken && refreshToken && realmId) {
          const client = getClientFromTokens(accessToken, refreshToken, realmId);
          try {
            invoice = await client.getInvoice(id);
          } catch {
            invoice = undefined;
          }
        }
      }
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      return NextResponse.json({ invoice: transformInvoice(invoice) });
    }

    // Get outstanding invoices
    if (outstanding === 'true') {
      const outstandingInvoices = (sync === 'true' || live === 'true')
        ? invoices.filter((invoice) => Number(invoice.Balance || 0) > 0)
        : getOutstandingInvoices();
      const transformed = transformInvoices(outstandingInvoices);
      const total = (sync === 'true' || live === 'true')
        ? outstandingInvoices.reduce((sum, invoice) => sum + Number(invoice.Balance || 0), 0)
        : getTotalOutstanding();
      return NextResponse.json({ invoices: transformed, totalOutstanding: total });
    }

    // Get invoices for specific customer
    if (customerId) {
      const customerInvoices = (sync === 'true' || live === 'true')
        ? invoices.filter((invoice) => invoice.CustomerRef?.value === customerId)
        : getInvoicesForCustomer(customerId);
      const transformed = transformInvoices(customerInvoices);
      return NextResponse.json({ invoices: transformed, total: transformed.length });
    }

    // Return all cached invoices
    const transformed = transformInvoices(invoices);
    return NextResponse.json({ invoices: transformed, total: transformed.length });
  } catch (err) {
    console.error('Failed to get invoices:', err);
    return NextResponse.json(
      { error: 'Failed to get invoices' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let accessToken = request.cookies.get('qb_access_token')?.value;
    let refreshToken = request.cookies.get('qb_refresh_token')?.value;
    let realmId = request.cookies.get('qb_realm_id')?.value;

    if (!accessToken || !refreshToken || !realmId) {
      const org = await getOrCreateDefaultOrg();
      if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
        accessToken = org.qbAccessToken;
        refreshToken = org.qbRefreshToken;
        realmId = org.qbRealmId;
      } else {
        return NextResponse.json(
          { error: 'Not connected to QuickBooks' },
          { status: 401 }
        );
      }
    }

    const body = await request.json();

    if ((body as any).action === 'sync') {
      const client = getClientFromTokens(accessToken, refreshToken, realmId);
      const fresh = await syncInvoices(client);
      return NextResponse.json({
        success: true,
        invoices: transformInvoices(fresh),
        total: fresh.length,
        syncStatus: getSyncStatus(),
      });
    }

    if ((body as any).action === 'send') {
      if (!(body as any).id) {
        return NextResponse.json({ error: 'id is required to send invoice' }, { status: 400 });
      }
      const client = getClientFromTokens(accessToken, refreshToken, realmId);

      if (isSmtpConfigured()) {
        const invoice = await client.getInvoice((body as any).id);
        const recipient = String((body as any).email || invoice.BillEmail?.Address || '').trim();
        if (!recipient) {
          return NextResponse.json({ error: 'Enter a customer email before sending this invoice.' }, { status: 400 });
        }

        const payUrl = paymentUrl(request, invoice);
        const invoiceNumber = invoice.DocNumber || invoice.Id;
        const pdf = await renderInvoicePdf({ invoice, paymentUrl: payUrl });
        await sendSmtpEmail({
          to: recipient,
          cc: parseEmailList((body as any).ccBcc),
          bcc: (body as any).sendMeCopy === false ? undefined : parseEmailList(process.env.SMTP_FROM || process.env.SMTP_USER),
          subject: (body as any).emailSubject || `Invoice ${invoiceNumber} from AARON'S FIREPLACE CO, LLC`,
          text: (body as any).emailBody || invoiceEmailText(invoice, payUrl),
          html: (body as any).emailBody
            ? `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;">${escapeHtml((body as any).emailBody)}</div>`
            : invoiceEmailHtml(invoice, payUrl),
          attachments: [{
            filename: `Invoice ${invoiceNumber}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          }],
        });

        addAuditLog({
          entityType: 'invoice',
          entityId: (body as any).id,
          action: 'update',
          actor: 'system',
          source: 'api',
          after: invoice,
          note: 'Invoice emailed from dashboard with Hearth PDF',
        });
        return NextResponse.json({ success: true, sentVia: 'smtp', invoice: transformInvoice(invoice) });
      }

      const sent = await client.sendInvoice((body as any).id, (body as any).email);
      addAuditLog({
        entityType: 'invoice',
        entityId: (body as any).id,
        action: 'update',
        actor: 'system',
        source: 'api',
        after: sent,
        note: 'Invoice emailed from dashboard',
      });
      return NextResponse.json({ success: true, invoice: sent?.Invoice || sent });
    }

    if ((body as any).action === 'update') {
      if (!(body as any).id) {
        return NextResponse.json({ error: 'id is required to update invoice' }, { status: 400 });
      }
      const client = getClientFromTokens(accessToken, refreshToken, realmId);
      const updated = await client.updateInvoice((body as any).id, (body as any).updates || {});
      await syncInvoices(client);
      addAuditLog({
        entityType: 'invoice',
        entityId: (body as any).id,
        action: 'update',
        actor: 'system',
        source: 'api',
        after: updated,
        note: 'Invoice updated from dashboard',
      });
      return NextResponse.json({ success: true, invoice: transformInvoice(updated) });
    }
    
    // Check if this is UI format (has lineItems) or QB format
    const isUIFormat = 'lineItems' in body && Array.isArray((body as any).lineItems);
    
    let qbInvoice: Partial<QBInvoice>;
    
    if (isUIFormat) {
      // Transform UI format to QB format
      const uiLineItems = (body.lineItems as Array<{description: string; itemId?: string; itemName?: string; partNumber?: string; qty: number; unitPrice: number; total: number}>);
      qbInvoice = {
        CustomerRef: {
          value: (body as any).customerId || '',
          name: (body as any).customerName || '',
        },
        TxnDate: (body as any).issueDate || new Date().toISOString().split('T')[0],
        DueDate: (body as any).dueDate,
        Line: uiLineItems.map((li, idx) => ({
          LineNum: idx + 1,
          Amount: li.total,
          DetailType: 'SalesItemLineDetail' as const,
          Description: li.partNumber ? `${li.description}\nPart: ${li.partNumber}` : li.description,
          SalesItemLineDetail: {
            ItemRef: {
              value: li.itemId || '',
              name: li.itemName || li.partNumber || li.description,
            },
            UnitPrice: li.unitPrice,
            Qty: li.qty,
          },
        })),
        PrivateNote: (body as any).notes,
      };
    } else {
      qbInvoice = body as Partial<QBInvoice>;
    }
    
    // Validate required fields
    if (!qbInvoice.CustomerRef?.value) {
      return NextResponse.json(
        { error: 'CustomerRef is required' },
        { status: 400 }
      );
    }

    if (!qbInvoice.Line || qbInvoice.Line.length === 0) {
      return NextResponse.json(
        { error: 'At least one line item is required' },
        { status: 400 }
      );
    }

    const client = getClientFromTokens(accessToken, refreshToken, realmId);
    const invoice = await createInvoiceInQuickBooks(client, qbInvoice);

    addAuditLog({
      entityType: 'invoice',
      entityId: invoice.Id,
      action: 'create',
      actor: 'system',
      source: 'api',
      after: invoice,
      note: 'Created in QuickBooks',
    });

    return NextResponse.json({ success: true, invoice: transformInvoice(invoice) });
  } catch (err) {
    console.error('Failed to create invoice:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create invoice' },
      { status: 500 }
    );
  }
}
