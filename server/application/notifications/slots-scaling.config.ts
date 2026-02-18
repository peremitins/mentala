/**
 * Централизованная конфигурация масштабирования слотов уведомлений.
 * Источник требований: .docs/notification_slots_scaling_tz.md
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

function parseNumberEnv(params: {
  keys: string[];
  defaultValue: number;
  min?: number;
  max?: number;
}): number {
  const { keys, defaultValue, min, max } = params;

  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) continue;

    let value = parsed;
    if (typeof min === 'number') {
      value = Math.max(min, value);
    }
    if (typeof max === 'number') {
      value = Math.min(max, value);
    }
    return value;
  }

  return defaultValue;
}

function parseBooleanEnv(params: {
  keys: string[];
  defaultValue: boolean;
}): boolean {
  const { keys, defaultValue } = params;

  for (const key of keys) {
    const raw = process.env[key];
    if (raw === undefined) continue;

    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }

  return defaultValue;
}

function parseStringEnv(params: {
  keys: string[];
  defaultValue: string;
}): string {
  const { keys, defaultValue } = params;

  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;

    const value = raw.trim();
    if (value.length > 0) return value;
  }

  return defaultValue;
}

/**
 * Lock namespace для регенерации слотов (обязательный контракт для advisory lock).
 * Должен быть стабильным int32 между всеми процессами.
 */
export const LOCK_NAMESPACE_SLOTS_GENERATION = 7_100_001;

/**
 * Отдельный namespace для mutex scheduler (защита от thundering herd).
 */
export const LOCK_NAMESPACE_SLOTS_SCHEDULER = 7_100_002;

/**
 * Дефолтные значения quiet-hours окна из ТЗ.
 */
export const DEFAULT_NOTIFICATION_TIME_RANGE_START = 540; // 09:00
export const DEFAULT_NOTIFICATION_TIME_RANGE_END = 1350; // 22:30
export const DEFAULT_NOTIFICATION_TIMEZONE = 'Europe/Moscow';

const DEFAULT_SCHEDULER_BATCH_SIZE = 200;
const DEFAULT_SCHEDULER_INTERVAL_MS = isDevelopment ? 30_000 : 60_000;
const DEFAULT_SCHEDULER_SHARDS = 16;

const resolvedSchedulerIntervalMs = parseNumberEnv({
  keys: ['SLOTS_SCHEDULER_INTERVAL_MS'],
  defaultValue: DEFAULT_SCHEDULER_INTERVAL_MS,
  min: 1_000,
});

const resolvedSchedulerShards = parseNumberEnv({
  keys: ['SLOTS_SCHEDULER_SHARDS'],
  defaultValue: DEFAULT_SCHEDULER_SHARDS,
  min: 1,
  max: 2_048,
});

const resolvedSchedulerCursorStaleMs = parseNumberEnv({
  keys: ['SLOTS_CURSOR_STALE_MS'],
  // Дефолт учитывает round-robin по shard + hard backpressure (интервал может расти до x4),
  // чтобы курсор не протухал между штатными проходами.
  defaultValue: Math.max(
    10 * 60_000,
    resolvedSchedulerIntervalMs * resolvedSchedulerShards * 8
  ),
  min: 1_000,
});

export const slotsScalingConfig = {
  featureFlags: {
    schedulerEnabled: parseBooleanEnv({
      keys: ['slots_scheduler_enabled', 'SLOTS_SCHEDULER_ENABLED'],
      defaultValue: true,
    }),
    regenerationEnabled: parseBooleanEnv({
      keys: ['slots_regen_enabled', 'SLOTS_REGEN_ENABLED'],
      defaultValue: true,
    }),
    shardingEnabled: parseBooleanEnv({
      keys: ['slots_sharding_enabled', 'SLOTS_SHARDING_ENABLED'],
      defaultValue: true,
    }),
    backpressureEnabled: parseBooleanEnv({
      keys: ['slots_backpressure_enabled', 'SLOTS_BACKPRESSURE_ENABLED'],
      defaultValue: true,
    }),
    dbUniqueConstraintEnabled: parseBooleanEnv({
      keys: [
        'slots_db_unique_constraint_enabled',
        'SLOTS_DB_UNIQUE_CONSTRAINT_ENABLED',
      ],
      defaultValue: true,
    }),
  },
  scheduler: {
    batchSize: parseNumberEnv({
      keys: ['SLOTS_SCHEDULER_BATCH_SIZE'],
      defaultValue: DEFAULT_SCHEDULER_BATCH_SIZE,
      min: 1,
    }),
    intervalMs: resolvedSchedulerIntervalMs,
    jitterMs: parseNumberEnv({
      keys: ['SLOTS_SCHEDULER_JITTER_MS'],
      defaultValue: 15_000,
      min: 0,
    }),
    shards: resolvedSchedulerShards,
    cursorStaleMs: resolvedSchedulerCursorStaleMs,
    fairnessMaxDelayHours: parseNumberEnv({
      keys: ['SLOTS_FAIRNESS_MAX_DELAY_HOURS'],
      defaultValue: 6,
      min: 1,
    }),
  },
  worker: {
    concurrency: parseNumberEnv({
      keys: ['SLOTS_WORKER_CONCURRENCY'],
      defaultValue: 2,
      min: 1,
      max: 32,
    }),
  },
  regeneration: {
    thresholdPercent: parseNumberEnv({
      keys: ['SLOTS_REGEN_THRESHOLD_PERCENT'],
      defaultValue: 80,
      min: 1,
      max: 100,
    }),
    safeQueuedWindowMinutes: parseNumberEnv({
      keys: ['SLOTS_SAFE_QUEUED_WINDOW_MINUTES'],
      defaultValue: 15,
      min: 0,
    }),
    safeWindowMinutes: parseNumberEnv({
      keys: ['SLOTS_REGEN_SAFE_WINDOW_MINUTES'],
      defaultValue: 10,
      min: 0,
    }),
    targetHorizonHours: parseNumberEnv({
      keys: ['SLOTS_TARGET_HORIZON_HOURS'],
      defaultValue: 48,
      min: 1,
    }),
    minHorizonHours: parseNumberEnv({
      keys: ['SLOTS_MIN_HORIZON_HOURS'],
      defaultValue: 2,
      min: 1,
    }),
    lockTimeoutMs: parseNumberEnv({
      keys: ['SLOTS_LOCK_TIMEOUT_MS'],
      defaultValue: 2_000,
      min: 100,
    }),
    maxRuntimeMs: parseNumberEnv({
      keys: ['SLOTS_REGEN_MAX_RUNTIME_MS'],
      defaultValue: 60_000,
      min: 1_000,
    }),
    txTimeoutMs: parseNumberEnv({
      keys: ['SLOTS_REGEN_TX_TIMEOUT_MS'],
      defaultValue: 20_000,
      min: 1_000,
    }),
    maxRowsPerRegen: parseNumberEnv({
      keys: ['SLOTS_MAX_ROWS_PER_REGEN'],
      defaultValue: 500,
      min: 1,
    }),
    minRegenIntervalMinutes: parseNumberEnv({
      keys: ['SLOTS_MIN_REGEN_INTERVAL_MINUTES'],
      defaultValue: 30,
      min: 1,
    }),
    jitterMinutes: parseNumberEnv({
      keys: ['SLOTS_JITTER_MINUTES'],
      defaultValue: 15,
      min: 0,
    }),
    minGapMinutes: parseNumberEnv({
      keys: ['SLOTS_MIN_GAP_MINUTES'],
      defaultValue: 10,
      min: 1,
    }),
  },
  backpressure: {
    queueDepthThreshold: parseNumberEnv({
      keys: ['SLOTS_BACKPRESSURE_QUEUE_DEPTH'],
      defaultValue: 1_000,
      min: 1,
    }),
    queueLagThresholdMs: parseNumberEnv({
      keys: ['SLOTS_BACKPRESSURE_QUEUE_LAG_MS'],
      defaultValue: 5 * 60_000,
      min: 1_000,
    }),
    recoveryCycles: parseNumberEnv({
      keys: ['SLOTS_BACKPRESSURE_RECOVERY_CYCLES'],
      defaultValue: 3,
      min: 1,
    }),
    // Фиксированные бизнес-пороги по ТЗ.
    softLagMs: 5 * 60_000,
    hardLagMs: 15 * 60_000,
    sloLagP95Ms: 2 * 60_000,
  },
  queue: {
    jobDedupTtlMs: parseNumberEnv({
      keys: ['SLOTS_JOB_DEDUP_TTL_MS'],
      defaultValue: 6 * 60 * 60_000,
      min: 1_000,
    }),
    rescheduleBaseDelayMs: parseNumberEnv({
      keys: ['SLOTS_RESCHEDULE_BASE_DELAY_MS'],
      defaultValue: 30_000,
      min: 1_000,
    }),
    rescheduleMaxDelayMs: parseNumberEnv({
      keys: ['SLOTS_RESCHEDULE_MAX_DELAY_MS'],
      defaultValue: 15 * 60_000,
      min: 1_000,
    }),
  },
  logs: {
    tracePrefix: parseStringEnv({
      keys: ['SLOTS_TRACE_PREFIX'],
      defaultValue: 'slots',
    }),
  },
} as const;

/**
 * Перевод минут в миллисекунды через единый helper (без ручной арифметики в бизнес-коде).
 */
export function minutesToMs(minutes: number): number {
  return Math.max(0, Math.floor(minutes * 60_000));
}

/**
 * Перевод часов в миллисекунды через единый helper.
 */
export function hoursToMs(hours: number): number {
  return Math.max(0, Math.floor(hours * 60 * 60_000));
}

/**
 * Экспоненциальный backoff для повторной постановки задач.
 */
export function calculateExponentialBackoffMs(params: {
  attempt: number;
  baseMs?: number;
  maxMs?: number;
}): number {
  const baseMs =
    params.baseMs ?? slotsScalingConfig.queue.rescheduleBaseDelayMs;
  const maxMs = params.maxMs ?? slotsScalingConfig.queue.rescheduleMaxDelayMs;
  const attempt = Math.max(0, Math.floor(params.attempt));
  return Math.min(maxMs, baseMs * 2 ** attempt);
}
