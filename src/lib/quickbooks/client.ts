import type { QBConfig, QBTokens, QBCustomer, QBItem, QBInvoice, QBPayment, QBQueryResponse } from './types';

const QB_BASE_URL = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
};

const QB_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export class QuickBooksClient {
  private config: QBConfig;
  private tokens: QBTokens | null = null;
  private realmId: string | null = null;

  constructor(config: QBConfig) {
    this.config = config;
  }

  // Set tokens after OAuth flow
  setTokens(tokens: QBTokens) {
    this.tokens = tokens;
  }

  // Set realm ID (company ID) after OAuth flow
  setRealmId(realmId: string) {
    this.realmId = realmId;
  }

  // Get current tokens (for checking if refreshed)
  getTokens(): QBTokens | null {
    return this.tokens;
  }

  // Get authorization URL for OAuth flow
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: this.config.redirectUri,
      state: state || 'random-state-string',
    });
    return `${QB_AUTH_URL}?${params.toString()}`;
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(code: string): Promise<QBTokens> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const tokens = await response.json() as QBTokens;
    this.tokens = tokens;
    return tokens;
  }

  // Refresh access token
  async refreshAccessToken(): Promise<QBTokens> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available');
    }

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refresh_token,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const tokens = await response.json() as QBTokens;
    this.tokens = tokens;
    return tokens;
  }

  // Make authenticated API request
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    if (!this.tokens || !this.realmId) {
      throw new Error('Not authenticated. Call setTokens() and setRealmId() first.');
    }

    const baseUrl = QB_BASE_URL[this.config.environment];
    const url = `${baseUrl}/v3/company/${this.realmId}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.tokens.access_token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QuickBooks API error: ${error}`);
    }

    return response.json() as Promise<T>;
  }

  // Query QuickBooks using SQL-like syntax
  async query<T>(query: string): Promise<T[]> {
    const encodedQuery = encodeURIComponent(query);
    const response = await this.request<QBQueryResponse<T>>(
      'GET',
      `/query?query=${encodedQuery}`
    );
    
    // Extract the array from QueryResponse
    const key = Object.keys(response.QueryResponse).find(k => k !== 'startPosition' && k !== 'maxResults' && k !== 'totalCount');
    return key ? (response.QueryResponse as Record<string, T[]>)[key] || [] : [];
  }

  // === CUSTOMERS ===
  
  async getCustomers(maxResults = 1000): Promise<QBCustomer[]> {
    return this.query<QBCustomer>(`SELECT * FROM Customer MAXRESULTS ${maxResults}`);
  }

  async getCustomer(id: string): Promise<QBCustomer> {
    const response = await this.request<{ Customer: QBCustomer }>(
      'GET',
      `/customer/${id}`
    );
    return response.Customer;
  }

  async createCustomer(customer: Partial<QBCustomer>): Promise<QBCustomer> {
    const response = await this.request<{ Customer: QBCustomer }>(
      'POST',
      '/customer',
      customer
    );
    return response.Customer;
  }

  async updateCustomer(id: string, customer: Partial<QBCustomer>): Promise<QBCustomer> {
    // Need to fetch existing first for sparse update
    const existing = await this.getCustomer(id);
    const response = await this.request<{ Customer: QBCustomer }>(
      'POST',
      '/customer',
      { ...existing, ...customer, Id: id, sparse: true }
    );
    return response.Customer;
  }

  // === ITEMS (Products/Services) ===

  async getItems(maxResults = 1000): Promise<QBItem[]> {
    return this.query<QBItem>(`SELECT * FROM Item MAXRESULTS ${maxResults}`);
  }

  async getItem(id: string): Promise<QBItem> {
    const response = await this.request<{ Item: QBItem }>(
      'GET',
      `/item/${id}`
    );
    return response.Item;
  }

  async createItem(item: Partial<QBItem>): Promise<QBItem> {
    const response = await this.request<{ Item: QBItem }>(
      'POST',
      '/item',
      item
    );
    return response.Item;
  }

  // === ESTIMATES ===

  async getEstimates(maxResults = 200): Promise<any[]> {
    return this.query<any>(`SELECT * FROM Estimate ORDERBY TxnDate DESC MAXRESULTS ${maxResults}`);
  }

  async createEstimate(estimate: any): Promise<any> {
    const response = await this.request<{ Estimate: any }>(
      'POST',
      '/estimate',
      estimate
    );
    return response.Estimate;
  }

  async sendEstimate(id: string, email?: string): Promise<any> {
    const body = email ? { BillEmail: { Address: email } } : {};
    const response = await this.request<{ Estimate: any }>(
      'POST',
      `/estimate/${id}/send`,
      body
    );
    return response.Estimate;
  }

  async getEstimate(id: string): Promise<any> {
    const response = await this.request<{ Estimate: any }>('GET', `/estimate/${id}`);
    return response.Estimate;
  }

  async updateEstimate(id: string, estimate: any): Promise<any> {
    const existing = await this.getEstimate(id);
    const response = await this.request<{ Estimate: any }>('POST', '/estimate', {
      ...existing,
      ...estimate,
      Id: id,
      sparse: true,
    });
    return response.Estimate;
  }

  // === INVOICES ===

  async getInvoices(maxResults = 100): Promise<QBInvoice[]> {
    return this.query<QBInvoice>(`SELECT * FROM Invoice ORDERBY TxnDate DESC MAXRESULTS ${maxResults}`);
  }

  async getInvoice(id: string): Promise<QBInvoice> {
    const response = await this.request<{ Invoice: QBInvoice }>(
      'GET',
      `/invoice/${id}`
    );
    return response.Invoice;
  }

  async createInvoice(invoice: Partial<QBInvoice>): Promise<QBInvoice> {
    const response = await this.request<{ Invoice: QBInvoice }>(
      'POST',
      '/invoice',
      invoice
    );
    return response.Invoice;
  }

  async updateInvoice(id: string, invoice: Partial<QBInvoice>): Promise<QBInvoice> {
    const existing = await this.getInvoice(id);
    const response = await this.request<{ Invoice: QBInvoice }>(
      'POST',
      '/invoice',
      { ...existing, ...invoice, Id: id, sparse: true }
    );
    return response.Invoice;
  }

  async sendInvoice(id: string, email?: string): Promise<{ Invoice: QBInvoice }> {
    const body = email ? { BillEmail: { Address: email } } : {};
    const response = await this.request<{ Invoice: QBInvoice }>(
      'POST',
      `/invoice/${id}/send`,
      body
    );
    return response;
  }

  // === PAYMENTS ===

  async getPayments(maxResults = 100): Promise<QBPayment[]> {
    return this.query<QBPayment>(`SELECT * FROM Payment ORDERBY TxnDate DESC MAXRESULTS ${maxResults}`);
  }

  async getPayment(id: string): Promise<QBPayment> {
    const response = await this.request<{ Payment: QBPayment }>(
      'GET',
      `/payment/${id}`
    );
    return response.Payment;
  }

  async createPayment(payment: Partial<QBPayment>): Promise<QBPayment> {
    const response = await this.request<{ Payment: QBPayment }>(
      'POST',
      '/payment',
      payment
    );
    return response.Payment;
  }

  // === VENDORS ===

  async getVendors(maxResults = 1000): Promise<any[]> {
    return this.query<any>(`SELECT * FROM Vendor MAXRESULTS ${maxResults}`);
  }

  // === PURCHASE ORDERS ===

  async getPurchaseOrders(maxResults = 200): Promise<any[]> {
    return this.query<any>(`SELECT * FROM PurchaseOrder ORDERBY TxnDate DESC MAXRESULTS ${maxResults}`);
  }

  async createPurchaseOrder(purchaseOrder: any): Promise<any> {
    const response = await this.request<{ PurchaseOrder: any }>(
      'POST',
      '/purchaseorder',
      purchaseOrder
    );
    return response.PurchaseOrder;
  }

  // === UTILITY ===

  // Get company info
  async getCompanyInfo(): Promise<{
    CompanyName: string;
    LegalName: string;
    CompanyAddr: {
      Line1: string;
      City: string;
      CountrySubDivisionCode: string;
      PostalCode: string;
    };
  }> {
    const response = await this.request<{ CompanyInfo: {
      CompanyName: string;
      LegalName: string;
      CompanyAddr: {
        Line1: string;
        City: string;
        CountrySubDivisionCode: string;
        PostalCode: string;
      };
    } }>(
      'GET',
      '/companyinfo/' + this.realmId
    );
    return response.CompanyInfo;
  }
}

// Factory function to create client from environment variables
export function createQuickBooksClient(): QuickBooksClient {
  return new QuickBooksClient({
    clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || '',
    environment: (process.env.QUICKBOOKS_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
  });
}
