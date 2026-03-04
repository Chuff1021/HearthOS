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

export function upsertSquarePaymentByOrderId(
  orderId: string,
  patch: Partial<StoredSquarePayment> & { id: string; createdAt: string; updatedAt: string }
) {
  const list = listSquarePayments();
  const idx = list.findIndex((p) => p.orderId === orderId || p.id === patch.id);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      ...patch,
      id: patch.id || list[idx].id,
      orderId: orderId || list[idx].orderId,
      updatedAt: new Date().toISOString(),
    } as StoredSquarePayment;
  } else {
    list.unshift({ ...patch, orderId } as StoredSquarePayment);
  }
  writeJsonFileWithBackup(FILE, list.slice(0, 1000));
}
