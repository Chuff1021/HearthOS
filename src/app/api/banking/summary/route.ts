import { NextResponse } from 'next/server';

type PlaidAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
  balances?: {
    available?: number | null;
    current?: number | null;
    iso_currency_code?: string | null;
    limit?: number | null;
  };
};

type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  date: string;
  authorized_date?: string | null;
  name: string;
  merchant_name?: string | null;
  amount: number;
  pending?: boolean;
  category?: string[] | null;
  payment_channel?: string | null;
};

const PLAID_ENV = process.env.PLAID_ENV || 'production';
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ACCESS_TOKEN = process.env.PLAID_ACCESS_TOKEN;

function plaidBaseUrl() {
  switch (PLAID_ENV) {
    case 'sandbox':
      return 'https://sandbox.plaid.com';
    case 'development':
      return 'https://development.plaid.com';
    default:
      return 'https://production.plaid.com';
  }
}

async function plaidPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      access_token: PLAID_ACCESS_TOKEN,
      ...body,
    }),
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error_message || data?.display_message || data?.error_code || 'Plaid request failed');
  }
  return data as T;
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export async function GET() {
  const missing = [
    !PLAID_CLIENT_ID ? 'PLAID_CLIENT_ID' : null,
    !PLAID_SECRET ? 'PLAID_SECRET' : null,
    !PLAID_ACCESS_TOKEN ? 'PLAID_ACCESS_TOKEN' : null,
  ].filter(Boolean);

  if (missing.length) {
    return NextResponse.json({
      configured: false,
      missing,
      accounts: [],
      transactions: [],
      summary: {
        currentBalance: 0,
        availableBalance: 0,
        moneyIn30: 0,
        moneyOut30: 0,
        pendingCount: 0,
      },
    });
  }

  try {
    const accountsData = await plaidPost<{ accounts: PlaidAccount[] }>('/accounts/balance/get', {});
    const accounts = accountsData.accounts || [];
    const transactionAdds: PlaidTransaction[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    let loops = 0;

    while (hasMore && loops < 5 && transactionAdds.length < 250) {
      const txData = await plaidPost<{
        added?: PlaidTransaction[];
        modified?: PlaidTransaction[];
        has_more?: boolean;
        next_cursor?: string;
      }>('/transactions/sync', {
        cursor,
        count: 100,
      });
      transactionAdds.push(...(txData.added || []), ...(txData.modified || []));
      hasMore = Boolean(txData.has_more);
      cursor = txData.next_cursor;
      loops += 1;
    }

    const transactions = transactionAdds
      .sort((a, b) => `${b.date}:${b.transaction_id}`.localeCompare(`${a.date}:${a.transaction_id}`))
      .slice(0, 100);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const recent = transactions.filter((tx) => new Date(tx.date) >= cutoff);

    const summary = {
      currentBalance: accounts.reduce((sum, account) => sum + money(account.balances?.current), 0),
      availableBalance: accounts.reduce((sum, account) => sum + money(account.balances?.available ?? account.balances?.current), 0),
      moneyIn30: recent.reduce((sum, tx) => sum + (tx.amount < 0 ? Math.abs(tx.amount) : 0), 0),
      moneyOut30: recent.reduce((sum, tx) => sum + (tx.amount > 0 ? tx.amount : 0), 0),
      pendingCount: transactions.filter((tx) => tx.pending).length,
    };

    return NextResponse.json({
      configured: true,
      environment: PLAID_ENV,
      fetchedAt: new Date().toISOString(),
      accounts: accounts.map((account) => ({
        id: account.account_id,
        name: account.name,
        officialName: account.official_name,
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
        currentBalance: money(account.balances?.current),
        availableBalance: money(account.balances?.available ?? account.balances?.current),
        currency: account.balances?.iso_currency_code || 'USD',
        limit: account.balances?.limit,
      })),
      transactions: transactions.map((tx) => ({
        id: tx.transaction_id,
        accountId: tx.account_id,
        date: tx.date,
        authorizedDate: tx.authorized_date,
        name: tx.merchant_name || tx.name,
        amount: tx.amount,
        pending: Boolean(tx.pending),
        category: tx.category || [],
        paymentChannel: tx.payment_channel,
      })),
      summary,
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        error: err instanceof Error ? err.message : 'Failed to load banking data',
        accounts: [],
        transactions: [],
        summary: {
          currentBalance: 0,
          availableBalance: 0,
          moneyIn30: 0,
          moneyOut30: 0,
          pendingCount: 0,
        },
      },
      { status: 502 },
    );
  }
}
