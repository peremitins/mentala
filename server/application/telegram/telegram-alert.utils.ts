export type TelegramAlertErrorDetails = {
  message: string;
  code: string | null;
  name: string | null;
  statusCode: number | null;
};

const DEFAULT_TELEGRAM_ALERT_BUCKET_WINDOW_MS = 5 * 60_000;

export function normalizeTelegramAlertErrorDetails(
  error: unknown,
  fallbackMessage: string
): TelegramAlertErrorDetails {
  const root = (error as { cause?: unknown })?.cause ?? error;
  const statusCandidate =
    (root as { statusCode?: unknown; status?: unknown })?.statusCode ??
    (root as { status?: unknown })?.status ??
    (error as { statusCode?: unknown; status?: unknown })?.statusCode ??
    (error as { status?: unknown })?.status;
  const parsedStatusCode = Number(statusCandidate);

  return {
    message:
      String(
        (root as { message?: unknown })?.message ??
          (error as { message?: unknown })?.message ??
          fallbackMessage
      ).trim() || fallbackMessage,
    code:
      String(
        (root as { code?: unknown })?.code ??
          (error as { code?: unknown })?.code ??
          ''
      ).trim() || null,
    name:
      String(
        (root as { name?: unknown })?.name ??
          (error as { name?: unknown })?.name ??
          ''
      ).trim() || null,
    statusCode: Number.isFinite(parsedStatusCode) ? parsedStatusCode : null,
  };
}

export function buildTelegramAlertTimeBucket(
  windowMs: number,
  nowMs = Date.now()
): string {
  return new Date(Math.floor(nowMs / windowMs) * windowMs).toISOString();
}

export function buildTelegramAlertBucketedDedupKey(params: {
  prefix: string;
  bucketWindowMs?: number;
  parts?: Array<string | number | null | undefined>;
  nowMs?: number;
}): string {
  const bucketWindowMs =
    params.bucketWindowMs ?? DEFAULT_TELEGRAM_ALERT_BUCKET_WINDOW_MS;
  const normalizedParts = (params.parts ?? [])
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);

  return [
    params.prefix,
    ...normalizedParts,
    buildTelegramAlertTimeBucket(bucketWindowMs, params.nowMs),
  ]
    .join(':')
    .replace(/:{2,}/g, ':');
}
