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
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';

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
        // КРИТИЧНО: Проверяем, что пользователь существует и не удален
        const [user] = await db
          .select({ id: users.id, isBlocked: users.isBlocked })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!user) {
          console.warn(
            `[Notification Slots Worker] ❌ User ${userId} does not exist, skipping job ${job.id}`
          );
          return { skipped: true, reason: 'user_not_found' };
        }

        if (user.isBlocked) {
          console.warn(
            `[Notification Slots Worker] ❌ User ${userId} is blocked/deleted, skipping job ${job.id}`
          );
          return { skipped: true, reason: 'user_blocked' };
        }

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
