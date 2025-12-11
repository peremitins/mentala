/**
 * Воркер для обработки задач генерации слотов уведомлений
 * @version BullMQ 5.x (без QueueScheduler)
 */

import type { Job } from 'bullmq';
import {
  createWorker,
  registerWorker,
} from '@/server/infrastructure/redis/bullmqClient';
import {
  NOTIFICATION_SLOTS_QUEUE,
  type NotificationSlotsGenerationJobData,
} from '../queues/notificationSlots.queue';
import {
  generateAllSlotsForUser,
  needsSlotRegeneration,
} from '@/server/application/notifications/scheduler.service';

/**
 * Запускает воркер для обработки задач генерации слотов
 */
export function startNotificationSlotsWorker() {
  const worker = createWorker<NotificationSlotsGenerationJobData>(
    NOTIFICATION_SLOTS_QUEUE,
    async (job: Job<NotificationSlotsGenerationJobData>) => {
      const { userId } = job.data;

      console.log(
        `[Notification Slots Worker] ▶️ Processing job ${job.id} for user ${userId}`
      );

      try {
        // Проверяем, нужна ли регенерация
        const needsRegen = await needsSlotRegeneration(userId);
        if (!needsRegen) {
          console.log(
            `[Notification Slots Worker] ⏭️ Job ${job.id} skipped: no regeneration needed`
          );
          return { skipped: true, reason: 'no_regeneration_needed' };
        }

        // Генерируем слоты
        await generateAllSlotsForUser(userId);

        console.log(
          `[Notification Slots Worker] ✅ Job ${job.id} completed for user ${userId}`
        );
        return { success: true };
      } catch (error) {
        console.error(
          `[Notification Slots Worker] ❌ Job ${job.id} failed:`,
          error
        );
        throw error; // BullMQ сделает retry автоматически
      }
    },
    {
      // Concurrency: 2 задачи параллельно
      // Генерация слотов ресурсоёмкая (тяжёлые DB операции)
      // При росте нагрузки рекомендуется протестировать значения 1-5
      concurrency: 2,
    }
  );

  // Регистрируем воркер для graceful shutdown
  registerWorker(worker);

  console.log(
    `[Notification Slots Worker] ✅ Worker started for queue: ${NOTIFICATION_SLOTS_QUEUE}`
  );

  return worker;
}
