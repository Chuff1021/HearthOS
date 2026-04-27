// QuickBooks Online API Types

export interface QBConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: 'sandbox' | 'production';
}

export interface QBTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type: string;
}

export interface QBCustomer {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: {
    Address: string;
  };
  PrimaryPhone?: {
    FreeFormNumber: string;
  };
  BillAddr?: {
    Line1?: string;
    Line2?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  ShipAddr?: {
    Line1?: string;
    Line2?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  Active: boolean;
  Balance: number;
  CreatedTime: string;
  LastUpdatedTime: string;
}

export interface QBItem {
  Id: string;
  Name: string;
  Description?: string;
  Sku?: string;
  Type: 'Service' | 'Inventory' | 'NonInventory' | 'Category';
  UnitPrice?: number;
  PurchaseCost?: number;
  QtyOnHand?: number;
  IncomeAccountRef?: {
    value: string;
    name: string;
  };
  ExpenseAccountRef?: {
    value: string;
    name: string;
  };
  AssetAccountRef?: {
    value: string;
    name: string;
  };
  Active: boolean;
  FullyQualifiedName: string;
  CreatedTime: string;
  LastUpdatedTime: string;
}

export interface QBInvoiceLine {
  Id?: string;
  LineNum?: number;
  Description?: string;
  Amount: number;
  DetailType: 'SalesItemLineDetail' | 'DescriptionOnly' | 'SubTotalLineDetail' | 'GroupLineDetail' | string;
  SalesItemLineDetail?: {
    ItemRef: {
      value: string;
      name?: string;
    };
    UnitPrice?: number;
    Qty?: number;
    TaxCodeRef?: {
      value: string;
    };
  };
  SubTotalLineDetail?: Record<string, never>;
}

export interface QBInvoice {
  Id: string;
  DocNumber: string;
  TxnDate: string;
  CustomerRef: {
    value: string;
    name: string;
  };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  ShipAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  Line: QBInvoiceLine[];
  TxnTaxDetail?: {
    TotalTax: number;
  };
  TotalAmt: number;
  Balance: number;
  DueDate?: string;
  EmailStatus?: 'NeedToSend' | 'NotSet' | 'EmailSent';
  BillEmail?: {
    Address: string;
  };
  CustomerMemo?: {
    value?: string;
  };
  PrivateNote?: string;
  CreatedTime: string;
  LastUpdatedTime: string;
}

export interface QBVendor {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  AlternatePhone?: { FreeFormNumber: string };
  WebAddr?: { URI: string };
  BillAddr?: {
    Line1?: string;
    Line2?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  AcctNum?: string;
  TaxIdentifier?: string;
  Vendor1099?: boolean;
  TermRef?: { value: string; name?: string };
  Active: boolean;
  Balance: number;
  CreatedTime: string;
  LastUpdatedTime: string;
}

export interface QBPayment {
  Id: string;
  TxnDate: string;
  CustomerRef: {
    value: string;
    name: string;
  };
  TotalAmt: number;
  UnappliedAmt?: number;
  Line?: {
    Amount: number;
    // QB returns LinkedTxn as an array of links per line.
    LinkedTxn?: { TxnId: string; TxnType: string }[] | { TxnId: string; TxnType: string };
  }[];
  PaymentMethodRef?: {
    value: string;
    name: string;
  };
  DepositToAccountRef?: {
    value: string;
    name: string;
  };
  CreatedTime: string;
  LastUpdatedTime: string;
}

// Generic line item used by Estimate, PurchaseOrder, and Bill
export interface QBExpenseLine {
  Id?: string;
  LineNum?: number;
  Description?: string;
  Amount: number;
  DetailType: string;
  ItemBasedExpenseLineDetail?: {
    ItemRef?: { value: string; name?: string };
    Qty?: number;
    UnitPrice?: number;
    BillableStatus?: 'Billable' | 'NotBillable' | 'HasBeenBilled';
    CustomerRef?: { value: string; name?: string };
  };
  AccountBasedExpenseLineDetail?: {
    AccountRef?: { value: string; name?: string };
    BillableStatus?: 'Billable' | 'NotBillable' | 'HasBeenBilled';
    CustomerRef?: { value: string; name?: string };
  };
  SalesItemLineDetail?: {
    ItemRef?: { value: string; name?: string };
    Qty?: number;
    UnitPrice?: number;
  };
}

export interface QBEstimate {
  Id: string;
  DocNumber?: string;
  TxnDate: string;
  ExpirationDate?: string;
  AcceptedDate?: string;
  TxnStatus?: 'Pending' | 'Accepted' | 'Closed' | 'Rejected';
  CustomerRef: { value: string; name?: string };
  Line: QBExpenseLine[];
  TxnTaxDetail?: { TotalTax: number };
  TotalAmt: number;
  CustomerMemo?: { value?: string };
  PrivateNote?: string;
  EmailStatus?: string;
  BillEmail?: { Address: string };
  CreatedTime: string;
  LastUpdatedTime: string;
}

export interface QBPurchaseOrder {
  Id: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  POStatus?: 'Open' | 'Closed';
  VendorRef: { value: string; name?: string };
  Line: QBExpenseLine[];
  TxnTaxDetail?: { TotalTax: number };
  TotalAmt: number;
  ShipAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  Memo?: string;
  PrivateNote?: string;
  EmailStatus?: string;
  CreatedTime: string;
  LastUpdatedTime: string;
}

export interface QBBill {
  Id: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  VendorRef: { value: string; name?: string };
  Line: QBExpenseLine[];
  TxnTaxDetail?: { TotalTax: number };
  TotalAmt: number;
  Balance: number;
  PrivateNote?: string;
  SalesTermRef?: { value: string; name?: string };
  CreatedTime: string;
  LastUpdatedTime: string;
}

export interface QBQueryResponse<T> {
  QueryResponse: {
    startPosition?: number;
    maxResults?: number;
    totalCount?: number;
    [key: string]: T[] | number | undefined;
  };
  time: string;
}

export interface QBErrorResponse {
  Fault: {
    Error: {
      Message: string;
      Code: string;
      Detail?: string;
    }[];
    type: string;
  };
  time: string;
}

// Sync tracking types
export interface QBSyncStatus {
  lastSync: Date;
  status: 'idle' | 'syncing' | 'error';
  error?: string;
  recordsSynced: {
    customers: number;
    items: number;
    invoices: number;
    payments: number;
    vendors: number;
    estimates: number;
    purchaseOrders: number;
    bills: number;
  };
}

export interface QBSyncLog {
  id: string;
  timestamp: Date;
  type: 'customers' | 'items' | 'invoices' | 'payments' | 'vendors' | 'estimates' | 'purchaseOrders' | 'bills';
  direction: 'import' | 'export';
  recordsProcessed: number;
  status: 'success' | 'partial' | 'error';
  error?: string;
}
