import { createQueue } from '@/server/infrastructure/redis/bullmqClient';

/**
 * Очередь для nightly-обработки неактивных therapy-сессий.
 *
 * Раз в сутки находим сессии без endedAt, которые уже пережили server-side
 * idle timeout, и для каждой пытаемся создать пользовательский итог.
 */

export const STALE_SESSION_SUMMARIZER_QUEUE = 'stale-session-summarizer';

export type StaleSessionSummarizerJobData = {
  // placeholder — задача self-contained, но BullMQ требует data-объект.
  triggeredAt: string;
};

export const staleSessionSummarizerQueue =
  createQueue<StaleSessionSummarizerJobData>(STALE_SESSION_SUMMARIZER_QUEUE, {
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { age: 7 * 24 * 3600, count: 30 },
      removeOnFail: { age: 30 * 24 * 3600, count: 100 },
    },
  });

// Cron: каждый день в 03:15 по Москве.
export const STALE_SESSION_CRON_PATTERN = '15 3 * * *';
export const STALE_SESSION_SCHEDULER_ID = 'stale-session-summarizer-daily';

/**
 * Регистрирует repeatable job через BullMQ 5.x Job Scheduler API.
 * Идемпотентно: повторный вызов перезаписывает расписание с тем же ID.
 */
export async function registerStaleSessionSummarizerSchedule() {
  const queue = staleSessionSummarizerQueue as unknown as {
    upsertJobScheduler?: (
      id: string,
      repeat: { pattern: string; tz?: string },
      template: {
        name: string;
        data: StaleSessionSummarizerJobData;
      }
    ) => Promise<unknown>;
    add?: (
      name: string,
      data: StaleSessionSummarizerJobData,
      opts?: Record<string, unknown>
    ) => Promise<unknown>;
  };

  // В BullMQ 5.x предпочтительно upsertJobScheduler.
  if (typeof queue.upsertJobScheduler === 'function') {
    await queue.upsertJobScheduler(
      STALE_SESSION_SCHEDULER_ID,
      { pattern: STALE_SESSION_CRON_PATTERN, tz: 'Europe/Moscow' },
      {
        name: 'stale-session-check',
        data: { triggeredAt: new Date().toISOString() },
      }
    );
    return;
  }

  // Fallback для среды, где upsertJobScheduler недоступен (например noop-queue).
  if (typeof queue.add === 'function') {
    try {
      await queue.add(
        'stale-session-check',
        { triggeredAt: new Date().toISOString() },
        {
          jobId: STALE_SESSION_SCHEDULER_ID,
          repeat: {
            pattern: STALE_SESSION_CRON_PATTERN,
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
