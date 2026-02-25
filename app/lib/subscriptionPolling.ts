export type PollingTerminalStatus =
  | 'active'
  | 'canceled'
  | 'expired'
  | 'timeout';
export type SubscriptionPollingStatus =
  | PollingTerminalStatus
  | 'pending'
  | 'none'
  | 'unknown';

export interface SubscriptionPollingResult {
  status: SubscriptionPollingStatus;
  attempts: number;
  elapsedMs: number;
}

export interface SubscriptionPollingOptions {
  maxDurationMs?: number;
  fastPhaseMs?: number;
  fastIntervalMs?: number;
  slowIntervalMs?: number;
}

const DEFAULT_OPTIONS: Required<SubscriptionPollingOptions> = {
  maxDurationMs: 30_000,
  fastPhaseMs: 5_000,
  fastIntervalMs: 1_000,
  slowIntervalMs: 3_000,
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeStatus(rawStatus: unknown): SubscriptionPollingStatus {
  if (rawStatus === 'active') return 'active';
  if (rawStatus === 'pending') return 'pending';
  if (rawStatus === 'canceled') return 'canceled';
  if (rawStatus === 'expired') return 'expired';
  if (!rawStatus) return 'none';
  return 'unknown';
}

export async function runSubscriptionShortPolling(
  fetchStatus: () => Promise<string | null | undefined>,
  options: SubscriptionPollingOptions = {}
): Promise<SubscriptionPollingResult> {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const startedAt = Date.now();
  let attempts = 0;

  // Сначала сразу проверяем состояние без задержки.
  for (;;) {
    attempts += 1;

    let status: SubscriptionPollingStatus = 'unknown';
    try {
      status = normalizeStatus(await fetchStatus());
    } catch {
      // Ошибки polling не должны срывать UX: продолжаем до окна timeout.
      status = 'unknown';
    }

    if (status === 'active' || status === 'canceled' || status === 'expired') {
      return {
        status,
        attempts,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= merged.maxDurationMs) {
      return {
        status: 'timeout',
        attempts,
        elapsedMs,
      };
    }

    const nextDelayMs =
      elapsedMs < merged.fastPhaseMs
        ? merged.fastIntervalMs
        : merged.slowIntervalMs;
    await wait(nextDelayMs);
  }
}
