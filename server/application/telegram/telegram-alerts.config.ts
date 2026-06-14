import { useRuntimeConfig } from '#imports';
import { isValidTimezone } from '@/server/application/notifications/timezone.utils';

export type TelegramAlertsConfig = {
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
  reportsTimezone: string;
  apiBaseHost: string;
  deliveryCleanupEnabled: boolean;
  deliveryRetentionDays: number;
  envLabel: string;
  apiTimeoutMs: number;
  http5xxSpikeThreshold: number;
  http5xxSpikeWindowMinutes: number;
  pushDegradationErrorRatePercent: number;
  pushDegradationMinAttempts: number;
  pushDegradationWindowMinutes: number;
};

function normalizeString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

const DEFAULT_TELEGRAM_API_HOST = 'api.telegram.org';

/**
 * Возвращает чистый хост Telegram Bot API. Принимаем как голый хост
 * (`proxy.example.com`), так и полный URL (`https://proxy.example.com/`) —
 * вырезаем схему, слэши и путь. Пустое значение → дефолтный api.telegram.org,
 * чтобы при незаданном прокси поведение не менялось.
 */
function normalizeTelegramApiHost(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return DEFAULT_TELEGRAM_API_HOST;
  }

  const withoutScheme = raw.replace(/^[a-z]+:\/\//i, '');
  const host = withoutScheme.split('/')[0]?.trim();
  return host || DEFAULT_TELEGRAM_API_HOST;
}

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function detectEnvLabel(rawValue: unknown): string {
  const fromEnv = normalizeString(rawValue);
  if (fromEnv) {
    return fromEnv.toLowerCase();
  }

  if (process.env.NODE_ENV === 'production') {
    return 'prod';
  }

  return 'dev';
}

export function getTelegramAlertsConfig(): TelegramAlertsConfig {
  const runtimeConfig = useRuntimeConfig();
  const botToken = normalizeString(runtimeConfig.TELEGRAM_ALERTS_BOT_TOKEN);
  const chatId = normalizeString(runtimeConfig.TELEGRAM_ALERTS_CHAT_ID);
  const reportsTimezoneRaw =
    normalizeString(runtimeConfig.TELEGRAM_REPORTS_TIMEZONE) || 'Europe/Moscow';
  const reportsTimezone = isValidTimezone(reportsTimezoneRaw)
    ? reportsTimezoneRaw
    : 'Europe/Moscow';

  return {
    enabled: Boolean(botToken && chatId),
    botToken,
    chatId,
    reportsTimezone,
    apiBaseHost: normalizeTelegramApiHost(
      runtimeConfig.TELEGRAM_API_BASE_HOST
    ),
    deliveryCleanupEnabled:
      String(runtimeConfig.TELEGRAM_ALERTS_DELIVERY_CLEANUP_ENABLED || '')
        .trim()
        .toLowerCase() !== 'false',
    deliveryRetentionDays: Math.max(
      1,
      Math.floor(
        normalizeNumber(
          runtimeConfig.TELEGRAM_ALERTS_DELIVERY_RETENTION_DAYS,
          30
        )
      )
    ),
    envLabel: detectEnvLabel(runtimeConfig.TELEGRAM_ALERTS_ENV_LABEL),
    apiTimeoutMs: Math.max(
      1000,
      normalizeNumber(runtimeConfig.TELEGRAM_API_TIMEOUT_MS, 15000)
    ),
    http5xxSpikeThreshold: Math.max(
      1,
      normalizeNumber(runtimeConfig.TELEGRAM_HTTP_5XX_SPIKE_THRESHOLD, 20)
    ),
    http5xxSpikeWindowMinutes: Math.max(
      1,
      normalizeNumber(runtimeConfig.TELEGRAM_HTTP_5XX_SPIKE_WINDOW_MINUTES, 5)
    ),
    pushDegradationErrorRatePercent: Math.min(
      100,
      Math.max(
        1,
        normalizeNumber(
          runtimeConfig.TELEGRAM_PUSH_DEGRADATION_ERROR_RATE_PERCENT,
          50
        )
      )
    ),
    pushDegradationMinAttempts: Math.max(
      1,
      normalizeNumber(runtimeConfig.TELEGRAM_PUSH_DEGRADATION_MIN_ATTEMPTS, 20)
    ),
    pushDegradationWindowMinutes: Math.max(
      1,
      normalizeNumber(runtimeConfig.TELEGRAM_PUSH_DEGRADATION_WINDOW_MINUTES, 5)
    ),
  };
}
