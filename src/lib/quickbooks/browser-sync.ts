export const quickBooksSyncEntities = [
  'customers',
  'items',
  'vendors',
  'invoices',
  'payments',
  'estimates',
  'purchase-orders',
  'bills',
] as const;

export type QuickBooksSyncEntity = typeof quickBooksSyncEntities[number];

export const quickBooksSyncLabels: Record<QuickBooksSyncEntity, string> = {
  customers: 'Customers',
  items: 'Items',
  vendors: 'Vendors',
  invoices: 'Invoices',
  payments: 'Payments',
  estimates: 'Estimates',
  'purchase-orders': 'Purchase orders',
  bills: 'Bills',
};

type SyncPageResponse = {
  success: boolean;
  fetched?: number;
  persisted?: number;
  nextStartPosition?: number | null;
  done?: boolean;
  error?: string;
};

export type QuickBooksSyncProgress = {
  entity: QuickBooksSyncEntity;
  label: string;
  fetched: number;
  persisted: number;
  complete: boolean;
};

export async function syncQuickBooksEntity(
  entity: QuickBooksSyncEntity,
  onProgress?: (progress: QuickBooksSyncProgress) => void,
): Promise<QuickBooksSyncProgress> {
  const pageSize = 500;
  let startPosition = 1;
  let fetched = 0;
  let persisted = 0;

  for (let pageNumber = 0; pageNumber < 1_000; pageNumber += 1) {
    const params = new URLSearchParams({
      startPosition: String(startPosition),
      pageSize: String(pageSize),
    });
    const response = await fetch(`/api/quickbooks/sync/${entity}?${params}`, {
      method: 'POST',
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({})) as SyncPageResponse;

    if (!response.ok || !data.success) {
      const message = data.error || `QuickBooks returned ${response.status}`;
      throw new Error(`${quickBooksSyncLabels[entity]} sync failed: ${message}`);
    }

    fetched += data.fetched || 0;
    persisted += data.persisted || 0;
    const complete = data.done === true || data.nextStartPosition == null;
    const progress = {
      entity,
      label: quickBooksSyncLabels[entity],
      fetched,
      persisted,
      complete,
    };
    onProgress?.(progress);

    if (complete) return progress;
    startPosition = data.nextStartPosition as number;
  }

  throw new Error(`${quickBooksSyncLabels[entity]} sync exceeded the page safety limit`);
}

export async function syncAllQuickBooksEntities(
  onProgress?: (progress: QuickBooksSyncProgress) => void,
): Promise<QuickBooksSyncProgress[]> {
  const results: QuickBooksSyncProgress[] = [];
  for (const entity of quickBooksSyncEntities) {
    results.push(await syncQuickBooksEntity(entity, onProgress));
  }
  return results;
}
