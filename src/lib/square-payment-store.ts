import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';

export type StoredSquarePayment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  customerName?: string;
  invoiceNumber?: string;
  sourceType?: string;
  orderId?: string;
  receiptUrl?: string;
  createdAt: string;
  updatedAt: string;
  raw?: unknown;
};

const FILE = 'square-payments.json';

export function listSquarePayments(): StoredSquarePayment[] {
  return readJsonFile<StoredSquarePayment[]>(FILE, []);
}

export function upsertSquarePayment(payment: StoredSquarePayment) {
  const list = listSquarePayments();
  const idx = list.findIndex((p) => p.id === payment.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...payment, updatedAt: new Date().toISOString() };
  } else {
    list.unshift(payment);
  }
  writeJsonFileWithBackup(FILE, list.slice(0, 1000));
}
