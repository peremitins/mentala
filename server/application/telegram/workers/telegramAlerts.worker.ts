import type { Job } from 'bullmq';
import {
  createWorker,
  registerWorker,
} from '@/server/infrastructure/redis/bullmqClient';
import {
  TELEGRAM_ALERTS_QUEUE,
  type TelegramAlertsJobData,
} from '@/server/application/telegram/queues/telegramAlerts.queue';
import { processTelegramAlertDelivery } from '@/server/application/telegram/telegram-alerts.service';

export function startTelegramAlertsWorker() {
  const worker = createWorker<TelegramAlertsJobData>(
    TELEGRAM_ALERTS_QUEUE,
    async (job: Job<TelegramAlertsJobData>) => {
      await processTelegramAlertDelivery({
        event: job.data.event,
        attempt: job.attemptsMade + 1,
      });

      return { success: true };
    },
    {
      concurrency: 1,
      limiter: {
        max: 1,
        duration: 1000,
      },
    }
  );

  registerWorker(worker);
  console.log(
    `[Telegram Alerts Worker] ✅ Worker started for queue: ${TELEGRAM_ALERTS_QUEUE}`
  );

  return worker;
}
