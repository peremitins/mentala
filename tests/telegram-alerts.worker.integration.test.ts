import { beforeEach, describe, expect, it, vi } from 'vitest';

type DeliveryLogRecord = {
  eventType: string;
  dedupKey: string;
  targetChannel: string;
  environment: string;
  status: 'queued' | 'processing' | 'sent' | 'failed';
  source: string;
  payload: Record<string, unknown>;
  eventCreatedAt: Date;
  attempt: number;
  errorMessage: string | null;
  providerResponseCode: number | null;
  providerRetryAfterSeconds: number | null;
  telegramMessageId: string | null;
  sentAt: Date | null;
};

const queuedJobs: Array<{
  name: string;
  data: Record<string, unknown>;
  options?: Record<string, unknown>;
}> = [];
const sentMessages: Array<{ text: string }> = [];
const deliveryLog = new Map<string, DeliveryLogRecord>();
const dbSelectRows: Array<Record<string, unknown>> = [];

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
vi.mock('@/server/application/telegram/telegram-alerts.service', async () => {
  return await import('../server/application/telegram/telegram-alerts.service');
});

vi.mock('@/server/infrastructure/db/client', () => ({
  db: {
    execute: vi.fn(async () => ({
      rows: [{ count: 0 }],
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => dbSelectRows),
        })),
      })),
    })),
  },
}));

vi.mock(
  '@/server/application/telegram/repositories/telegram-deliveries.repository',
  () => ({
    createQueuedTelegramDelivery: vi.fn(
      async ({
        event,
        targetChannel,
      }: {
        event: {
          type: string;
          dedupKey: string;
          environment: string;
          source: string;
          payload: Record<string, unknown>;
          createdAt: string;
        };
        targetChannel: string;
      }) => {
        if (deliveryLog.has(event.dedupKey)) {
          return false;
        }

        deliveryLog.set(event.dedupKey, {
          eventType: event.type,
          dedupKey: event.dedupKey,
          targetChannel,
          environment: event.environment,
          status: 'queued',
          source: event.source,
          payload: event.payload,
          eventCreatedAt: new Date(event.createdAt),
          attempt: 0,
          errorMessage: null,
          providerResponseCode: null,
          providerRetryAfterSeconds: null,
          telegramMessageId: null,
          sentAt: null,
        });

        return true;
      }
    ),
    hasTelegramDeliveryByDedupKey: vi.fn(async (dedupKey: string) =>
      deliveryLog.has(dedupKey)
    ),
    markTelegramDeliveryQueueFailure: vi.fn(
      async ({
        dedupKey,
        errorMessage,
      }: {
        dedupKey: string;
        errorMessage: string;
      }) => {
        const record = deliveryLog.get(dedupKey);
        if (!record) return;

        record.status = 'failed';
        record.errorMessage = errorMessage;
      }
    ),
    markTelegramDeliveryProcessing: vi.fn(
      async ({ dedupKey, attempt }: { dedupKey: string; attempt: number }) => {
        const record = deliveryLog.get(dedupKey);
        if (!record) return;

        record.status = 'processing';
        record.attempt = attempt;
        record.errorMessage = null;
        record.providerResponseCode = null;
        record.providerRetryAfterSeconds = null;
      }
    ),
    markTelegramDeliverySent: vi.fn(
      async ({
        dedupKey,
        attempt,
        providerResponseCode,
        telegramMessageId,
      }: {
        dedupKey: string;
        attempt: number;
        providerResponseCode: number | null;
        telegramMessageId: string | null;
      }) => {
        const record = deliveryLog.get(dedupKey);
        if (!record) return;

        record.status = 'sent';
        record.attempt = attempt;
        record.providerResponseCode = providerResponseCode;
        record.telegramMessageId = telegramMessageId;
        record.sentAt = new Date('2026-03-12T10:05:00.000Z');
        record.errorMessage = null;
        record.providerRetryAfterSeconds = null;
      }
    ),
    markTelegramDeliveryFailed: vi.fn(
      async ({
        dedupKey,
        attempt,
        errorMessage,
        providerResponseCode,
        providerRetryAfterSeconds,
      }: {
        dedupKey: string;
        attempt: number;
        errorMessage: string;
        providerResponseCode?: number | null;
        providerRetryAfterSeconds?: number | null;
      }) => {
        const record = deliveryLog.get(dedupKey);
        if (!record) return;

        record.status = 'failed';
        record.attempt = attempt;
        record.errorMessage = errorMessage;
        record.providerResponseCode = providerResponseCode ?? null;
        record.providerRetryAfterSeconds = providerRetryAfterSeconds ?? null;
      }
    ),
  })
);
vi.mock(
  '../server/application/telegram/repositories/telegram-deliveries.repository',
  () => ({
    createQueuedTelegramDelivery: vi.fn(
      async ({
        event,
        targetChannel,
      }: {
        event: {
          type: string;
          dedupKey: string;
          environment: string;
          source: string;
          payload: Record<string, unknown>;
          createdAt: string;
        };
        targetChannel: string;
      }) => {
        if (deliveryLog.has(event.dedupKey)) {
          return false;
        }

        deliveryLog.set(event.dedupKey, {
          eventType: event.type,
          dedupKey: event.dedupKey,
          targetChannel,
          environment: event.environment,
          status: 'queued',
          source: event.source,
          payload: event.payload,
          eventCreatedAt: new Date(event.createdAt),
          attempt: 0,
          errorMessage: null,
          providerResponseCode: null,
          providerRetryAfterSeconds: null,
          telegramMessageId: null,
          sentAt: null,
        });

        return true;
      }
    ),
    hasTelegramDeliveryByDedupKey: vi.fn(async (dedupKey: string) =>
      deliveryLog.has(dedupKey)
    ),
    markTelegramDeliveryQueueFailure: vi.fn(
      async ({
        dedupKey,
        errorMessage,
      }: {
        dedupKey: string;
        errorMessage: string;
      }) => {
        const record = deliveryLog.get(dedupKey);
        if (!record) return;

        record.status = 'failed';
        record.errorMessage = errorMessage;
      }
    ),
    markTelegramDeliveryProcessing: vi.fn(
      async ({ dedupKey, attempt }: { dedupKey: string; attempt: number }) => {
        const record = deliveryLog.get(dedupKey);
        if (!record) return;

        record.status = 'processing';
        record.attempt = attempt;
        record.errorMessage = null;
        record.providerResponseCode = null;
        record.providerRetryAfterSeconds = null;
      }
    ),
    markTelegramDeliverySent: vi.fn(
      async ({
        dedupKey,
        attempt,
        providerResponseCode,
        telegramMessageId,
      }: {
        dedupKey: string;
        attempt: number;
        providerResponseCode: number | null;
        telegramMessageId: string | null;
      }) => {
        const record = deliveryLog.get(dedupKey);
        if (!record) return;

        record.status = 'sent';
        record.attempt = attempt;
        record.providerResponseCode = providerResponseCode;
        record.telegramMessageId = telegramMessageId;
        record.sentAt = new Date('2026-03-12T10:05:00.000Z');
        record.errorMessage = null;
        record.providerRetryAfterSeconds = null;
      }
    ),
    markTelegramDeliveryFailed: vi.fn(
      async ({
        dedupKey,
        attempt,
        errorMessage,
        providerResponseCode,
        providerRetryAfterSeconds,
      }: {
        dedupKey: string;
        attempt: number;
        errorMessage: string;
        providerResponseCode?: number | null;
        providerRetryAfterSeconds?: number | null;
      }) => {
        const record = deliveryLog.get(dedupKey);
        if (!record) return;

        record.status = 'failed';
        record.attempt = attempt;
        record.errorMessage = errorMessage;
        record.providerResponseCode = providerResponseCode ?? null;
        record.providerRetryAfterSeconds = providerRetryAfterSeconds ?? null;
      }
    ),
  })
);

vi.mock('@/server/application/telegram/queues/telegramAlerts.queue', () => ({
  TELEGRAM_ALERTS_QUEUE: 'telegram-alerts',
  buildTelegramAlertsJobId: (dedupKey: string) => `telegram-alert-${dedupKey}`,
  telegramAlertsQueue: {
    add: vi.fn(
      async (
        name: string,
        data: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => {
        queuedJobs.push({ name, data, options });
        return { id: options?.jobId ?? `telegram-alert:${queuedJobs.length}` };
      }
    ),
  },
}));
vi.mock('../server/application/telegram/queues/telegramAlerts.queue', () => ({
  TELEGRAM_ALERTS_QUEUE: 'telegram-alerts',
  buildTelegramAlertsJobId: (dedupKey: string) => `telegram-alert-${dedupKey}`,
  telegramAlertsQueue: {
    add: vi.fn(
      async (
        name: string,
        data: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => {
        queuedJobs.push({ name, data, options });
        return { id: options?.jobId ?? `telegram-alert:${queuedJobs.length}` };
      }
    ),
  },
}));

vi.mock('@/server/application/telegram/telegram.client', () => ({
  TelegramApiError: class TelegramApiError extends Error {
    statusCode: number | null;
    retryAfterSeconds: number | null;

    constructor(params: {
      message: string;
      statusCode?: number | null;
      retryAfterSeconds?: number | null;
    }) {
      super(params.message);
      this.name = 'TelegramApiError';
      this.statusCode = params.statusCode ?? null;
      this.retryAfterSeconds = params.retryAfterSeconds ?? null;
    }
  },
  sendTelegramMessage: vi.fn(async ({ text }: { text: string }) => {
    sentMessages.push({ text });
    return {
      telegramMessageId: '777',
      providerResponseCode: 200,
    };
  }),
}));
vi.mock('../server/application/telegram/telegram.client', () => ({
  TelegramApiError: class TelegramApiError extends Error {
    statusCode: number | null;
    retryAfterSeconds: number | null;

    constructor(params: {
      message: string;
      statusCode?: number | null;
      retryAfterSeconds?: number | null;
    }) {
      super(params.message);
      this.name = 'TelegramApiError';
      this.statusCode = params.statusCode ?? null;
      this.retryAfterSeconds = params.retryAfterSeconds ?? null;
    }
  },
  sendTelegramMessage: vi.fn(async ({ text }: { text: string }) => {
    sentMessages.push({ text });
    return {
      telegramMessageId: '777',
      providerResponseCode: 200,
    };
  }),
}));

vi.mock('@/server/infrastructure/redis/bullmqClient', () => ({
  createWorker: vi.fn(
    (
      _name: string,
      processor: (job: {
        data: Record<string, unknown>;
        attemptsMade: number;
      }) => Promise<unknown>
    ) => {
      const worker = {
        on: vi.fn(() => worker),
        close: vi.fn(async () => undefined),
        __processor: processor,
      };

      return worker;
    }
  ),
  registerWorker: vi.fn(),
}));
vi.mock('../server/infrastructure/redis/bullmqClient', () => ({
  createWorker: vi.fn(
    (
      _name: string,
      processor: (job: {
        data: Record<string, unknown>;
        attemptsMade: number;
      }) => Promise<unknown>
    ) => {
      const worker = {
        on: vi.fn(() => worker),
        close: vi.fn(async () => undefined),
        __processor: processor,
      };

      return worker;
    }
  ),
  registerWorker: vi.fn(),
}));

describe('telegram alerts worker integration', () => {
  beforeEach(() => {
    queuedJobs.length = 0;
    sentMessages.length = 0;
    deliveryLog.clear();
    dbSelectRows.length = 0;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('обогащает user alerts почтой из users перед постановкой в очередь', async () => {
    dbSelectRows.push({
      email: 'user-42@example.com',
    });

    const { enqueueUserRegisteredAlertSafe } = await import(
      '../server/application/telegram/telegram-alerts.service'
    );

    await enqueueUserRegisteredAlertSafe({
      userId: 42,
      method: 'email',
    });

    expect(queuedJobs).toHaveLength(1);
    expect(
      (
        queuedJobs[0]!.data as {
          event: {
            payload: Record<string, unknown>;
          };
        }
      ).event.payload
    ).toMatchObject({
      userId: 42,
      userEmail: 'user-42@example.com',
    });
  });

  it('проводит alert от enqueue до sent delivery log через worker processor', async () => {
    const { enqueueTelegramAlert } = await import(
      '../server/application/telegram/telegram-alerts.service'
    );
    const { startTelegramAlertsWorker } = await import(
      '../server/application/telegram/workers/telegramAlerts.worker'
    );

    const worker = startTelegramAlertsWorker() as {
      __processor: (job: {
        id: string;
        data: Record<string, unknown>;
        attemptsMade: number;
      }) => Promise<unknown>;
    };

    const event = {
      type: 'user.registered' as const,
      dedupKey: 'users:registered:user:42',
      source: 'auth:email',
      createdAt: '2026-03-12T10:00:00.000Z',
      environment: 'test',
      payload: {
        userId: 42,
        userEmail: 'user-42@example.com',
        method: 'email',
        occurredAt: '2026-03-12T10:00:00.000Z',
      },
    };

    const enqueueResult = await enqueueTelegramAlert(event);

    expect(enqueueResult).toEqual({ enqueued: true });
    expect(queuedJobs).toHaveLength(1);
    expect(deliveryLog.get(event.dedupKey)?.status).toBe('queued');

    await worker.__processor({
      id: 'job-1',
      data: queuedJobs[0]!.data,
      attemptsMade: 0,
    });

    const deliveryRecord = deliveryLog.get(event.dedupKey);

    expect(deliveryRecord).toMatchObject({
      eventType: 'user.registered',
      targetChannel: 'users',
      environment: 'test',
      status: 'sent',
      attempt: 1,
      providerResponseCode: 200,
      telegramMessageId: '777',
    });
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.text).toContain('[USERS]');
    expect(sentMessages[0]!.text).toContain(
      'Новый зарегистрированный пользователь'
    );
    expect(sentMessages[0]!.text).toContain('Email: user-42@example.com');
  });

  it('форматирует billing critical alert в billing-канал', async () => {
    const { enqueueTelegramAlert } = await import(
      '../server/application/telegram/telegram-alerts.service'
    );
    const { startTelegramAlertsWorker } = await import(
      '../server/application/telegram/workers/telegramAlerts.worker'
    );

    const worker = startTelegramAlertsWorker() as {
      __processor: (job: {
        id: string;
        data: Record<string, unknown>;
        attemptsMade: number;
      }) => Promise<unknown>;
    };

    const event = {
      type: 'billing.critical_error' as const,
      dedupKey: 'billing:critical_error:test',
      source: 'payments.yookassa.webhook',
      createdAt: '2026-03-12T10:00:00.000Z',
      environment: 'test',
      payload: {
        source: 'payments.yookassa.webhook',
        operation: 'activate_paid_subscription',
        reason: 'amount_mismatch',
        userId: 42,
        userEmail: 'user-42@example.com',
        subscriptionId: 55,
        paymentId: 'pay_123',
        planId: 'pro',
        billingPeriod: 'month',
        statusCode: 502,
        errorMessage: 'YooKassa webhook amount mismatch',
        errorCode: 'AMOUNT_MISMATCH',
        occurredAt: '2026-03-12T10:00:00.000Z',
      },
    };

    const enqueueResult = await enqueueTelegramAlert(event);

    expect(enqueueResult).toEqual({ enqueued: true });

    await worker.__processor({
      id: 'job-critical-1',
      data: queuedJobs[0]!.data,
      attemptsMade: 0,
    });

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.text).toContain('[BILLING]');
    expect(sentMessages[0]!.text).toContain('Критическая ошибка биллинга');
    expect(sentMessages[0]!.text).toContain('Причина: amount_mismatch');
    expect(sentMessages[0]!.text).toContain('Email: user-42@example.com');
  });

  it('форматирует business flow critical alert в errors-канал', async () => {
    const { enqueueTelegramAlert } = await import(
      '../server/application/telegram/telegram-alerts.service'
    );
    const { startTelegramAlertsWorker } = await import(
      '../server/application/telegram/workers/telegramAlerts.worker'
    );

    const worker = startTelegramAlertsWorker() as {
      __processor: (job: {
        id: string;
        data: Record<string, unknown>;
        attemptsMade: number;
      }) => Promise<unknown>;
    };

    const event = {
      type: 'error.business_flow_critical' as const,
      dedupKey: 'error:business_flow_critical:test',
      source: 'notification-slots.scheduler',
      createdAt: '2026-03-12T10:00:00.000Z',
      environment: 'test',
      payload: {
        flow: 'notifications.slot_generation',
        source: 'notification-slots.scheduler',
        operation: 'scheduler_tick',
        userId: 42,
        userEmail: 'user-42@example.com',
        statusCode: 500,
        errorMessage: 'Scheduler tick failed',
        errorCode: 'SCHEDULER_FAILED',
        occurredAt: '2026-03-12T10:00:00.000Z',
      },
    };

    const enqueueResult = await enqueueTelegramAlert(event);

    expect(enqueueResult).toEqual({ enqueued: true });

    await worker.__processor({
      id: 'job-business-flow-1',
      data: queuedJobs[0]!.data,
      attemptsMade: 0,
    });

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.text).toContain('[ERRORS]');
    expect(sentMessages[0]!.text).toContain(
      'Критическая ошибка бизнес-сценария'
    );
    expect(sentMessages[0]!.text).toContain(
      'Flow: notifications.slot_generation'
    );
    expect(sentMessages[0]!.text).toContain('Email: user-42@example.com');
  });
});
