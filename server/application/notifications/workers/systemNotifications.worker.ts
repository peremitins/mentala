import type { Job } from 'bullmq';
import {
  createWorker,
  registerWorker,
} from '@/server/infrastructure/redis/bullmqClient';
import {
  registerSystemNotificationsSchedule,
  SYSTEM_NOTIFICATIONS_QUEUE,
  type SystemNotificationsJobData,
} from '@/server/application/notifications/queues/systemNotifications.queue';
import { runSystemNotificationScheduler } from '@/server/application/notifications/system-notifications.service';

export function startSystemNotificationsWorker() {
  const worker = createWorker<SystemNotificationsJobData>(
    SYSTEM_NOTIFICATIONS_QUEUE,
    async (job: Job<SystemNotificationsJobData>) => {
      console.log(
        `[SystemNotificationsWorker] Job ${job.id} started (triggeredAt=${job.data?.triggeredAt})`
      );

      const result = await runSystemNotificationScheduler();

      console.log(
        '[SystemNotificationsWorker] Run complete:',
        JSON.stringify(result)
      );

      return result;
    },
    {
      concurrency: 1,
    }
  );

  registerWorker(worker);

  void registerSystemNotificationsSchedule().catch((error) => {
    console.error(
      '[SystemNotificationsWorker] Failed to register schedule:',
      error
    );
  });

  return worker;
}
