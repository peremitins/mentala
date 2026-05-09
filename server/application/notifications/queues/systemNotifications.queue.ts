import { createQueue } from '@/server/infrastructure/redis/bullmqClient';

export const SYSTEM_NOTIFICATIONS_QUEUE = 'system-notifications';

export type SystemNotificationsJobData = {
  triggeredAt: string;
};

export const systemNotificationsQueue = createQueue<SystemNotificationsJobData>(
  SYSTEM_NOTIFICATIONS_QUEUE,
  {
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { age: 24 * 3600, count: 100 },
      removeOnFail: { age: 7 * 24 * 3600, count: 500 },
    },
  }
);

export const SYSTEM_NOTIFICATIONS_CRON_PATTERN = '*/15 * * * *';
export const SYSTEM_NOTIFICATIONS_SCHEDULER_ID =
  'system-notifications-quarter-hourly';

export async function registerSystemNotificationsSchedule() {
  const queue = systemNotificationsQueue as unknown as {
    upsertJobScheduler?: (
      id: string,
      repeat: { pattern: string; tz?: string },
      template: {
        name: string;
        data: SystemNotificationsJobData;
      }
    ) => Promise<unknown>;
    add?: (
      name: string,
      data: SystemNotificationsJobData,
      opts?: Record<string, unknown>
    ) => Promise<unknown>;
  };

  if (typeof queue.upsertJobScheduler === 'function') {
    await queue.upsertJobScheduler(
      SYSTEM_NOTIFICATIONS_SCHEDULER_ID,
      { pattern: SYSTEM_NOTIFICATIONS_CRON_PATTERN, tz: 'Europe/Moscow' },
      {
        name: 'system-notifications-scan',
        data: { triggeredAt: new Date().toISOString() },
      }
    );
    return;
  }

  if (typeof queue.add === 'function') {
    try {
      await queue.add(
        'system-notifications-scan',
        { triggeredAt: new Date().toISOString() },
        {
          jobId: SYSTEM_NOTIFICATIONS_SCHEDULER_ID,
          repeat: {
            pattern: SYSTEM_NOTIFICATIONS_CRON_PATTERN,
            tz: 'Europe/Moscow',
          },
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists')) {
        throw error;
      }
    }
  }
}
