import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';

type MemoryEvent = {
  id: string;
  timestamp: string;
  entity: string;
  action: 'create' | 'update' | 'delete';
  entityId: string;
  summary: string;
  payload?: unknown;
};

const FILE = 'long-term-memory-events.json';

export function appendMemoryEvent(event: Omit<MemoryEvent, 'id' | 'timestamp'>) {
  const items = readJsonFile<MemoryEvent[]>(FILE, []);
  items.unshift({
    id: `mem-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...event,
  });
  writeJsonFileWithBackup(FILE, items.slice(0, 5000));
}
