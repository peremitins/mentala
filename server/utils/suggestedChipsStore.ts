const CHIPS_LIMIT = 30;
const CHIPS_TTL_MS = 12 * 60 * 60 * 1000;

type ChipsEntry = {
  chips: string[];
  updatedAt: number;
};

const store = new Map<string, ChipsEntry>();

function cleanupStale(now: number) {
  for (const [key, entry] of store.entries()) {
    if (now - entry.updatedAt > CHIPS_TTL_MS) {
      store.delete(key);
    }
  }
}

export function getRecentChips(key: string, limit = CHIPS_LIMIT): string[] {
  const now = Date.now();
  cleanupStale(now);

  const entry = store.get(key);
  if (!entry) return [];
  return entry.chips.slice(-limit);
}

export function addRecentChips(key: string, chips: string[]): void {
  if (!chips.length) return;

  const now = Date.now();
  cleanupStale(now);

  const entry = store.get(key);
  const next = (entry?.chips || []).concat(chips);
  const trimmed = next.slice(-CHIPS_LIMIT);

  // Обновляем историю последних чипов для анти-повторов.
  store.set(key, { chips: trimmed, updatedAt: now });
}
