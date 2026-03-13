import {
  buildTelegramAlertEvent,
  buildTelegramAlertStableHash,
  enqueueTelegramAlertSafe,
} from './telegram-alerts.service';
import { getTelegramAlertsConfig } from './telegram-alerts.config';
import {
  buildTelegramAlertBucketedDedupKey,
  buildTelegramAlertTimeBucket,
  normalizeTelegramAlertErrorDetails,
} from './telegram-alert.utils';
import { resolveTelegramAlertUserEmail } from './telegram-alert-user-context';

type PushWindowSample = {
  timestampMs: number;
  attempts: number;
  failures: number;
};

const http5xxSamples: number[] = [];
const pushWindowSamples: PushWindowSample[] = [];

let lastHttp5xxAlertBucket: string | null = null;
let lastPushDegradationAlertBucket: string | null = null;

function normalizeNullableString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function pruneHttp5xxSamples(windowStartMs: number): void {
  while (
    http5xxSamples.length > 0 &&
    http5xxSamples[0] &&
    http5xxSamples[0] < windowStartMs
  ) {
    http5xxSamples.shift();
  }
}

function prunePushSamples(windowStartMs: number): void {
  while (
    pushWindowSamples.length > 0 &&
    pushWindowSamples[0] &&
    pushWindowSamples[0].timestampMs < windowStartMs
  ) {
    pushWindowSamples.shift();
  }
}

export async function recordHttp5xxResponse(params: {
  path?: string | null;
  method?: string | null;
  statusCode: number;
}): Promise<void> {
  if (params.statusCode < 500 || params.statusCode > 599) {
    return;
  }

  const config = getTelegramAlertsConfig();
  const windowMs = config.http5xxSpikeWindowMinutes * 60_000;
  const nowMs = Date.now();
  const bucket = buildTelegramAlertTimeBucket(windowMs, nowMs);

  http5xxSamples.push(nowMs);
  pruneHttp5xxSamples(nowMs - windowMs);

  if (http5xxSamples.length < config.http5xxSpikeThreshold) {
    return;
  }

  if (lastHttp5xxAlertBucket === bucket) {
    return;
  }

  lastHttp5xxAlertBucket = bucket;

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'devops.http_500_spike',
      dedupKey: buildTelegramAlertBucketedDedupKey({
        prefix: 'devops:http_500_spike',
        bucketWindowMs: windowMs,
        parts: ['global'],
      }),
      source: 'nitro.afterResponse',
      payload: {
        threshold: config.http5xxSpikeThreshold,
        count: http5xxSamples.length,
        windowMinutes: config.http5xxSpikeWindowMinutes,
        statusCode: params.statusCode,
        path: params.path ?? null,
        method: params.method ?? null,
        occurredAt: new Date(nowMs).toISOString(),
      },
    })
  );
}

export async function enqueuePushDeliveryUnavailableAlertSafe(params: {
  source: string;
  reason:
    | 'failure_rate_threshold_exceeded'
    | 'queue_stalled'
    | 'provider_unavailable';
  attempts?: number;
  failedAttempts?: number;
  errorRatePercent?: number;
  jobId?: string | null;
  error?: unknown;
}): Promise<void> {
  const config = getTelegramAlertsConfig();
  const details = params.error
    ? normalizeTelegramAlertErrorDetails(params.error, params.reason)
    : null;

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'devops.push_delivery_unavailable',
      dedupKey: buildTelegramAlertBucketedDedupKey({
        prefix: 'devops:push_delivery_unavailable',
        bucketWindowMs: config.pushDegradationWindowMinutes * 60_000,
        parts: [params.reason, params.source],
      }),
      source: params.source,
      payload: {
        source: params.source,
        reason: params.reason,
        attempts: params.attempts ?? null,
        failedAttempts: params.failedAttempts ?? null,
        errorRatePercent: params.errorRatePercent ?? null,
        windowMinutes: config.pushDegradationWindowMinutes,
        minAttempts: config.pushDegradationMinAttempts,
        thresholdPercent: config.pushDegradationErrorRatePercent,
        jobId: params.jobId ?? null,
        errorMessage: details?.message ?? null,
        errorCode: details?.code ?? null,
        errorName: details?.name ?? null,
        occurredAt: new Date().toISOString(),
      },
    })
  );
}

export async function recordPushDeliverySample(params: {
  source: string;
  attempts: number;
  failures: number;
}): Promise<void> {
  if (params.attempts <= 0) {
    return;
  }

  const config = getTelegramAlertsConfig();
  const windowMs = config.pushDegradationWindowMinutes * 60_000;
  const nowMs = Date.now();
  const bucket = buildTelegramAlertTimeBucket(windowMs, nowMs);

  pushWindowSamples.push({
    timestampMs: nowMs,
    attempts: params.attempts,
    failures: params.failures,
  });
  prunePushSamples(nowMs - windowMs);

  const totals = pushWindowSamples.reduce(
    (accumulator, sample) => {
      accumulator.attempts += sample.attempts;
      accumulator.failures += sample.failures;
      return accumulator;
    },
    { attempts: 0, failures: 0 }
  );

  if (totals.attempts < config.pushDegradationMinAttempts) {
    return;
  }

  const errorRatePercent =
    totals.attempts > 0 ? (totals.failures / totals.attempts) * 100 : 0;

  if (errorRatePercent < config.pushDegradationErrorRatePercent) {
    return;
  }

  if (lastPushDegradationAlertBucket === bucket) {
    return;
  }

  lastPushDegradationAlertBucket = bucket;

  await enqueuePushDeliveryUnavailableAlertSafe({
    source: params.source,
    reason: 'failure_rate_threshold_exceeded',
    attempts: totals.attempts,
    failedAttempts: totals.failures,
    errorRatePercent: Math.round(errorRatePercent * 100) / 100,
  });
}

export async function enqueueAppCriticalAlertSafe(params: {
  source: string;
  error: unknown;
  path?: string | null;
  statusCode?: number | null;
}): Promise<void> {
  const details = normalizeTelegramAlertErrorDetails(
    params.error,
    'app_critical_error'
  );
  const statusCode = params.statusCode ?? details.statusCode;
  const errorHash = buildTelegramAlertStableHash(
    `${params.source}:${statusCode ?? 'no-status'}:${details.message}`
  );

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'error.app_critical',
      dedupKey: buildTelegramAlertBucketedDedupKey({
        prefix: 'error:app_critical',
        parts: [params.source, statusCode ?? 'no-status', errorHash],
      }),
      source: params.source,
      payload: {
        source: params.source,
        path: params.path ?? null,
        statusCode,
        errorMessage: details.message,
        errorCode: details.code,
        errorName: details.name,
        occurredAt: new Date().toISOString(),
      },
    })
  );
}

export async function enqueueIntegrationCriticalAlertSafe(params: {
  source: string;
  integration: string;
  error: unknown;
  statusCode?: number | null;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const details = normalizeTelegramAlertErrorDetails(
    params.error,
    'integration_critical_error'
  );
  const statusCode = params.statusCode ?? details.statusCode;
  const errorHash = buildTelegramAlertStableHash(
    `${params.integration}:${params.source}:${statusCode ?? 'no-status'}:${details.message}`
  );

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'error.integration_critical',
      dedupKey: buildTelegramAlertBucketedDedupKey({
        prefix: 'error:integration_critical',
        parts: [
          params.integration,
          params.source,
          statusCode ?? 'no-status',
          errorHash,
        ],
      }),
      source: params.source,
      payload: {
        integration: params.integration,
        source: params.source,
        statusCode,
        errorMessage: details.message,
        errorCode: details.code,
        errorName: details.name,
        occurredAt: new Date().toISOString(),
        ...params.extra,
      },
    })
  );
}

export async function enqueueBusinessFlowCriticalAlertSafe(params: {
  flow: string;
  source: string;
  operation?: string | null;
  userId?: number | null;
  userEmail?: string | null;
  statusCode?: number | null;
  error: unknown;
  context?: Record<string, unknown>;
  occurredAt?: Date;
}): Promise<void> {
  const flow = normalizeNullableString(params.flow) || 'unknown_flow';
  const operation = normalizeNullableString(params.operation);
  const userId = normalizeNullableNumber(params.userId);
  const userEmail = await resolveTelegramAlertUserEmail({
    userId,
    userEmail: params.userEmail,
  });
  const details = normalizeTelegramAlertErrorDetails(
    params.error,
    'business_flow_critical_error'
  );
  const statusCode = params.statusCode ?? details.statusCode;
  const errorHash = buildTelegramAlertStableHash(
    [
      flow,
      params.source,
      operation ?? 'unknown_operation',
      statusCode ?? 'no-status',
      details.message,
    ].join(':')
  );

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'error.business_flow_critical',
      dedupKey: buildTelegramAlertBucketedDedupKey({
        prefix: 'error:business_flow_critical',
        parts: [
          flow,
          params.source,
          operation ?? 'unknown_operation',
          userId ?? 'no-user',
          statusCode ?? 'no-status',
          errorHash,
        ],
      }),
      source: params.source,
      payload: {
        flow,
        source: params.source,
        operation,
        userId,
        userEmail,
        statusCode,
        errorMessage: details.message,
        errorCode: details.code,
        errorName: details.name,
        context: params.context ?? null,
        occurredAt: (params.occurredAt ?? new Date()).toISOString(),
      },
    })
  );
}
