import { createHash } from 'node:crypto';
import { createQueue } from '@/server/infrastructure/redis/bullmqClient';
import type { TelegramAlertEnvelope } from '@/server/application/telegram/telegram-alert.types';

export const TELEGRAM_ALERTS_QUEUE = 'telegram-alerts';

export type TelegramAlertsJobData = {
  event: TelegramAlertEnvelope;
};

export function buildTelegramAlertsJobId(dedupKey: string): string {
  const hash = createHash('sha256').update(dedupKey, 'utf8').digest('hex');
  return `telegram-alert-${hash}`;
}

export const telegramAlertsQueue = createQueue<TelegramAlertsJobData>(
  TELEGRAM_ALERTS_QUEUE,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10_000,
      },
      removeOnComplete: {
        age: 14 * 24 * 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 30 * 24 * 3600,
        count: 5000,
      },
    },
  }
);
