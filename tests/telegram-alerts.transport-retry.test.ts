import { beforeEach, describe, expect, it, vi } from 'vitest';

const markProcessing = vi.fn(async () => undefined);
const markSent = vi.fn(async () => undefined);
const markFailed = vi.fn(async () => undefined);
const markUncertain = vi.fn(async () => undefined);

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    TELEGRAM_ALERTS_BOT_TOKEN: 'test-bot-token',
    TELEGRAM_ALERTS_CHAT_ID: '-100000000001',
    TELEGRAM_REPORTS_TIMEZONE: 'Europe/Moscow',
    TELEGRAM_ALERTS_ENV_LABEL: 'test',
    TELEGRAM_API_TIMEOUT_MS: '5000',
    TELEGRAM_HTTP_5XX_SPIKE_THRESHOLD: '20',
    TELEGRAM_HTTP_5XX_SPIKE_WINDOW_MINUTES: '5',
    TELEGRAM_PUSH_DEGRADATION_ERROR_RATE_PERCENT: '50',
    TELEGRAM_PUSH_DEGRADATION_MIN_ATTEMPTS: '20',
    TELEGRAM_PUSH_DEGRADATION_WINDOW_MINUTES: '5',
  }),
}));

vi.mock('@/server/application/notifications/timezone.utils', () => ({
  isValidTimezone: () => true,
}));

vi.mock('@/server/infrastructure/db/client', () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock(
  '@/server/application/telegram/repositories/telegram-deliveries.repository',
  () => ({
    createQueuedTelegramDelivery: vi.fn(),
    hasTelegramDeliveryByDedupKey: vi.fn(),
    markTelegramDeliveryQueueFailure: vi.fn(),
    markTelegramDeliveryProcessing: markProcessing,
    markTelegramDeliverySent: markSent,
    markTelegramDeliveryFailed: markFailed,
    markTelegramDeliveryUncertain: markUncertain,
  })
);
vi.mock(
  '../server/application/telegram/repositories/telegram-deliveries.repository',
  () => ({
    createQueuedTelegramDelivery: vi.fn(),
    hasTelegramDeliveryByDedupKey: vi.fn(),
    markTelegramDeliveryQueueFailure: vi.fn(),
    markTelegramDeliveryProcessing: markProcessing,
    markTelegramDeliverySent: markSent,
    markTelegramDeliveryFailed: markFailed,
    markTelegramDeliveryUncertain: markUncertain,
  })
);
vi.mock('@/server/infrastructure/redis/bullmqClient', () => ({
  createQueue: vi.fn(() => ({
    add: vi.fn(),
  })),
}));

describe('telegram alerts transport retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('ретраит transient transport error внутри одной job и завершает отправку без final fail', async () => {
    const { TelegramApiError } = await import(
      '../server/application/telegram/telegram.client'
    );

    const sendTelegramMessage = vi
      .fn()
      .mockRejectedValueOnce(
        new TelegramApiError({
          message:
            'Telegram transport error: ECONNRESET Client network socket disconnected before secure TLS connection was established',
          transportCode: 'ECONNRESET',
        })
      )
      .mockRejectedValueOnce(
        new TelegramApiError({
          message:
            'Telegram transport error: ECONNRESET Client network socket disconnected before secure TLS connection was established',
          transportCode: 'ECONNRESET',
        })
      )
      .mockResolvedValueOnce({
        telegramMessageId: '123',
        providerResponseCode: 200,
      });

    vi.doMock('@/server/application/telegram/telegram.client', async () => {
      const actual = await vi.importActual<
        typeof import('../server/application/telegram/telegram.client')
      >('../server/application/telegram/telegram.client');

      return {
        ...actual,
        sendTelegramMessage,
      };
    });
    vi.doMock('../server/application/telegram/telegram.client', async () => {
      const actual = await vi.importActual<
        typeof import('../server/application/telegram/telegram.client')
      >('../server/application/telegram/telegram.client');

      return {
        ...actual,
        sendTelegramMessage,
      };
    });

    vi.useFakeTimers();

    const { processTelegramAlertDelivery } = await import(
      '../server/application/telegram/telegram-alerts.service'
    );

    const processingPromise = processTelegramAlertDelivery({
      event: {
        type: 'user.registered',
        dedupKey: 'users:registered:user:1',
        source: 'auth:email',
        createdAt: '2026-03-12T11:00:00.000Z',
        environment: 'test',
        payload: {
          userId: 1,
          method: 'email',
          occurredAt: '2026-03-12T11:00:00.000Z',
        },
      },
      attempt: 1,
    });

    await vi.runAllTimersAsync();
    await processingPromise;

    expect(sendTelegramMessage).toHaveBeenCalledTimes(3);
    expect(markProcessing).toHaveBeenCalledTimes(1);
    expect(markSent).toHaveBeenCalledTimes(1);
    expect(markFailed).not.toHaveBeenCalled();
    expect(markUncertain).not.toHaveBeenCalled();
  });

  it('не ретраит timeout, а помечает доставку как uncertain, чтобы не дублировать алерт', async () => {
    const sendTelegramMessage = vi.fn();

    vi.doMock('@/server/application/telegram/telegram.client', async () => {
      const actual = await vi.importActual<
        typeof import('../server/application/telegram/telegram.client')
      >('../server/application/telegram/telegram.client');

      sendTelegramMessage.mockRejectedValueOnce(
        new actual.TelegramApiError({
          message: 'Telegram sendMessage timed out after 5000ms',
          transportCode: 'TIMEOUT',
        })
      );

      return {
        ...actual,
        sendTelegramMessage,
      };
    });
    vi.doMock('../server/application/telegram/telegram.client', async () => {
      const actual = await vi.importActual<
        typeof import('../server/application/telegram/telegram.client')
      >('../server/application/telegram/telegram.client');

      sendTelegramMessage.mockRejectedValueOnce(
        new actual.TelegramApiError({
          message: 'Telegram sendMessage timed out after 5000ms',
          transportCode: 'TIMEOUT',
        })
      );

      return {
        ...actual,
        sendTelegramMessage,
      };
    });

    const { processTelegramAlertDelivery } = await import(
      '../server/application/telegram/telegram-alerts.service'
    );

    await processTelegramAlertDelivery({
      event: {
        type: 'billing.purchase_success',
        dedupKey: 'billing:purchase_success:payment:test-payment',
        source: 'subscriptions.check-payment-status',
        createdAt: '2026-03-16T10:11:24.000Z',
        environment: 'test',
        payload: {
          userId: 107,
          subscriptionId: 203,
          paymentId: 'test-payment',
          planId: 'premium',
          billingPeriod: 'year',
          amountMinor: 623000,
          currency: 'RUB',
          occurredAt: '2026-03-16T10:11:24.000Z',
        },
      },
      attempt: 1,
    });

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(markProcessing).toHaveBeenCalledTimes(1);
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
    expect(markUncertain).toHaveBeenCalledTimes(1);
  });
});
