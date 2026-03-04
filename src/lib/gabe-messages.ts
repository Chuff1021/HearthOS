import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';

export interface GabeConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface GabeMessage {
  id: string;
  timestamp: string;
  techId?: string;
  techName?: string;
  jobId?: string;
  jobNumber?: string;
  customerName?: string;
  fireplace?: string;
  messages: GabeConversationTurn[];
  duration?: number;
  rating?: number;
  flagged?: boolean;
  flagReason?: string;
}

const FILE = 'gabe-messages.json';

type GabeStore = {
  messages: GabeMessage[];
  nextId: number;
};

function getStore(): GabeStore {
  return readJsonFile<GabeStore>(FILE, {
    messages: [],
    nextId: 1,
  });
}

function saveStore(store: GabeStore) {
  writeJsonFileWithBackup(FILE, store);
}

export function getGabeMessages(filters?: {
  techId?: string;
  jobId?: string;
  startDate?: string;
  endDate?: string;
  flagged?: boolean;
}): GabeMessage[] {
  const { messages } = getStore();
  let filtered = [...messages];

  if (filters?.techId) filtered = filtered.filter((m) => m.techId === filters.techId);
  if (filters?.jobId) filtered = filtered.filter((m) => m.jobId === filters.jobId);
  if (filters?.startDate) filtered = filtered.filter((m) => m.timestamp >= filters.startDate!);
  if (filters?.endDate) filtered = filtered.filter((m) => m.timestamp <= filters.endDate!);
  if (filters?.flagged !== undefined) filtered = filtered.filter((m) => !!m.flagged === filters.flagged);

  return filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getGabeMessageById(id: string): GabeMessage | undefined {
  return getStore().messages.find((m) => m.id === id);
}

export function saveGabeMessage(message: Omit<GabeMessage, 'id' | 'timestamp'>): GabeMessage {
  const store = getStore();
  const newMessage: GabeMessage = {
    ...message,
    id: `msg-${String(store.nextId).padStart(5, '0')}`,
    timestamp: new Date().toISOString(),
  };

  store.nextId += 1;
  store.messages.unshift(newMessage);
  saveStore(store);
  return newMessage;
}

export function updateGabeMessage(id: string, updates: Partial<GabeMessage>): GabeMessage | null {
  const store = getStore();
  const idx = store.messages.findIndex((m) => m.id === id);
  if (idx === -1) return null;

  store.messages[idx] = { ...store.messages[idx], ...updates };
  saveStore(store);
  return store.messages[idx];
}

export function flagGabeMessage(id: string, reason: string): GabeMessage | null {
  return updateGabeMessage(id, { flagged: true, flagReason: reason });
}

export function deleteGabeMessage(id: string): boolean {
  const store = getStore();
  const idx = store.messages.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  store.messages.splice(idx, 1);
  saveStore(store);
  return true;
}

export function getGabeMessageStats() {
  const messages = getStore().messages;
  const total = messages.length;
  const todayPrefix = new Date().toISOString().split('T')[0];
  const today = messages.filter((m) => m.timestamp.startsWith(todayPrefix)).length;
  const flagged = messages.filter((m) => !!m.flagged).length;
  const rated = messages.filter((m) => typeof m.rating === 'number');
  const avgRating = rated.length ? rated.reduce((sum, m) => sum + (m.rating || 0), 0) / rated.length : 0;

  const techs = messages
    .filter((m) => m.techId || m.techName)
    .reduce<Record<string, { techId: string; techName: string; count: number }>>((acc, m) => {
      const key = m.techId || m.techName || 'unknown';
      if (!acc[key]) {
        acc[key] = {
          techId: m.techId || key,
          techName: m.techName || m.techId || 'Unknown Tech',
          count: 0,
        };
      }
      acc[key].count += 1;
      return acc;
    }, {});

  return {
    total,
    today,
    flagged,
    avgRating,
    techs: Object.values(techs).sort((a, b) => b.count - a.count),
  };
}
