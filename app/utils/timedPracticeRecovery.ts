import {
  getPersistentItem,
  removePersistentItem,
  setPersistentItem,
} from '@/app/utils/persistentStorage';

export type TimedPracticeRecoveryScope = 'roadmap' | 'free';

export type TimedPracticeRecoveryRecord = {
  version: 1;
  id: string;
  scope: TimedPracticeRecoveryScope;
  type: string;
  requiredSeconds: number;
  accumulatedMs: number;
  startedAtMs: number | null;
  running: boolean;
  updatedAtMs: number;
  completedAtMs: number | null;
  attemptId?: number;
  actionId?: string;
  programSlug?: string;
  step?: number;
  source?: string;
  sourceId?: string;
};

export type TimedPracticeRecoveryInput = Omit<
  TimedPracticeRecoveryRecord,
  | 'version'
  | 'accumulatedMs'
  | 'startedAtMs'
  | 'running'
  | 'updatedAtMs'
  | 'completedAtMs'
>;

const STORAGE_KEY = 'timed-practice-recovery-v1';
const MAX_RECORD_AGE_MS = 36 * 60 * 60 * 1000;

export function buildRoadmapTimedPracticeRecoveryId(params: {
  attemptId: number;
  actionId: string;
}) {
  return `roadmap:${params.attemptId}:${params.actionId}`;
}

export function buildFreeTimedPracticeRecoveryId(params: {
  source: string;
  sourceId: string;
}) {
  return `free:${params.source}:${params.sourceId}`;
}

export function createTimedPracticeRecoveryRecord(
  input: TimedPracticeRecoveryInput,
  now = Date.now()
): TimedPracticeRecoveryRecord {
  return {
    ...input,
    version: 1,
    requiredSeconds: normalizeRequiredSeconds(input.requiredSeconds),
    accumulatedMs: 0,
    startedAtMs: null,
    running: false,
    updatedAtMs: now,
    completedAtMs: null,
  };
}

export function startTimedPracticeRecoveryRecord(
  record: TimedPracticeRecoveryRecord,
  now = Date.now()
): TimedPracticeRecoveryRecord {
  if (record.running) {
    return {
      ...record,
      updatedAtMs: now,
    };
  }

  return {
    ...record,
    startedAtMs: now,
    running: true,
    updatedAtMs: now,
    completedAtMs: null,
  };
}

export function pauseTimedPracticeRecoveryRecord(
  record: TimedPracticeRecoveryRecord,
  now = Date.now()
): TimedPracticeRecoveryRecord {
  if (!record.running || record.startedAtMs === null) {
    return {
      ...record,
      startedAtMs: null,
      running: false,
      updatedAtMs: now,
    };
  }

  return {
    ...record,
    accumulatedMs: getTimedPracticeElapsedMs(record, now),
    startedAtMs: null,
    running: false,
    updatedAtMs: now,
  };
}

export function completeTimedPracticeRecoveryRecord(
  record: TimedPracticeRecoveryRecord,
  now = Date.now()
): TimedPracticeRecoveryRecord {
  return {
    ...record,
    accumulatedMs: Math.max(
      getTimedPracticeElapsedMs(record, now),
      record.requiredSeconds * 1000
    ),
    startedAtMs: null,
    running: false,
    updatedAtMs: now,
    completedAtMs: now,
  };
}

export function getTimedPracticeElapsedMs(
  record: TimedPracticeRecoveryRecord,
  now = Date.now()
) {
  const runningMs =
    record.running && record.startedAtMs !== null
      ? Math.max(0, now - record.startedAtMs)
      : 0;
  return Math.max(0, record.accumulatedMs + runningMs);
}

export function hasTimedPracticeReachedRequiredTime(
  record: TimedPracticeRecoveryRecord,
  now = Date.now()
) {
  return getTimedPracticeElapsedMs(record, now) >= record.requiredSeconds * 1000;
}

export async function getTimedPracticeRecoveryRecords(
  now = Date.now()
): Promise<TimedPracticeRecoveryRecord[]> {
  const raw = await getPersistentItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isTimedPracticeRecoveryRecord)
      .filter((record) => now - record.updatedAtMs <= MAX_RECORD_AGE_MS);
  } catch (error) {
    console.warn('[TimedPracticeRecovery] Не удалось прочитать состояние:', error);
    return [];
  }
}

export async function getTimedPracticeRecoveryRecord(
  id: string
): Promise<TimedPracticeRecoveryRecord | null> {
  const records = await getTimedPracticeRecoveryRecords();
  return records.find((record) => record.id === id) ?? null;
}

export async function upsertTimedPracticeRecoveryRecord(
  record: TimedPracticeRecoveryRecord
) {
  const records = await getTimedPracticeRecoveryRecords(record.updatedAtMs);
  const nextRecords = [
    ...records.filter((item) => item.id !== record.id),
    normalizeTimedPracticeRecoveryRecord(record),
  ];
  await writeTimedPracticeRecoveryRecords(nextRecords);
}

export async function removeTimedPracticeRecoveryRecord(id: string) {
  const records = await getTimedPracticeRecoveryRecords();
  const nextRecords = records.filter((record) => record.id !== id);

  if (nextRecords.length === 0) {
    await removePersistentItem(STORAGE_KEY);
    return;
  }

  await writeTimedPracticeRecoveryRecords(nextRecords);
}

async function writeTimedPracticeRecoveryRecords(
  records: TimedPracticeRecoveryRecord[]
) {
  if (records.length === 0) {
    await removePersistentItem(STORAGE_KEY);
    return;
  }

  await setPersistentItem(STORAGE_KEY, JSON.stringify(records));
}

function normalizeTimedPracticeRecoveryRecord(
  record: TimedPracticeRecoveryRecord
): TimedPracticeRecoveryRecord {
  return {
    ...record,
    requiredSeconds: normalizeRequiredSeconds(record.requiredSeconds),
    accumulatedMs: normalizeMs(record.accumulatedMs),
    startedAtMs:
      typeof record.startedAtMs === 'number' && Number.isFinite(record.startedAtMs)
        ? Math.floor(record.startedAtMs)
        : null,
    updatedAtMs: normalizeMs(record.updatedAtMs),
    completedAtMs:
      typeof record.completedAtMs === 'number' &&
      Number.isFinite(record.completedAtMs)
        ? Math.floor(record.completedAtMs)
        : null,
  };
}

function isTimedPracticeRecoveryRecord(
  value: unknown
): value is TimedPracticeRecoveryRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<TimedPracticeRecoveryRecord>;
  return (
    record.version === 1 &&
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    (record.scope === 'roadmap' || record.scope === 'free') &&
    typeof record.type === 'string' &&
    record.type.length > 0 &&
    typeof record.requiredSeconds === 'number' &&
    Number.isFinite(record.requiredSeconds) &&
    typeof record.accumulatedMs === 'number' &&
    Number.isFinite(record.accumulatedMs) &&
    (record.startedAtMs === null ||
      (typeof record.startedAtMs === 'number' &&
        Number.isFinite(record.startedAtMs))) &&
    typeof record.running === 'boolean' &&
    typeof record.updatedAtMs === 'number' &&
    Number.isFinite(record.updatedAtMs) &&
    (record.completedAtMs === null ||
      (typeof record.completedAtMs === 'number' &&
        Number.isFinite(record.completedAtMs)))
  );
}

function normalizeRequiredSeconds(value: number) {
  const safe = Number.isFinite(value) ? value : 1;
  return Math.max(1, Math.floor(safe));
}

function normalizeMs(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.floor(safe));
}
