/**
 * Воркер для обработки задач отправки уведомлений
 * @version BullMQ 5.x (без QueueScheduler)
 */

import type { Job } from 'bullmq';
import {
  createWorker,
  registerWorker,
} from '@/server/infrastructure/redis/bullmqClient';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  type NotificationDeliveryJobData,
} from '../queues/notificationDelivery.queue';
import { sendToUser } from '@/server/application/notifications/delivery.service';
import { db } from '@/server/infrastructure/db/client';
import { notificationSlots } from '@/server/infrastructure/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Запускает воркер для обработки задач отправки уведомлений
 */
export function startNotificationDeliveryWorker() {
  const worker = createWorker<NotificationDeliveryJobData>(
    NOTIFICATION_DELIVERY_QUEUE,
    async (job: Job<NotificationDeliveryJobData>) => {
      const { slotId, userId, payload } = job.data;

      console.log(
        `[Notification Delivery Worker] ▶️ Processing job ${job.id} for slot ${slotId}`
      );

      try {
        // Отправляем уведомление
        const successCount = await sendToUser(userId, payload);

        if (successCount > 0) {
          // КРИТИЧНО: Атомарно обновляем статус только если слот еще в статусе 'queued'
          // Это предотвращает перезапись статуса, если слот уже был обработан другим воркером
          const updateResult = await db
            .update(notificationSlots)
            .set({ status: 'sent' })
            .where(
              and(
                eq(notificationSlots.id, slotId),
                eq(notificationSlots.status, 'queued') // Только если еще queued
              )
            );

          const rowsAffected = updateResult.rowCount || 0;
          if (rowsAffected === 0) {
            // Слот уже был обработан (статус изменился или слот удален)
            console.warn(
              `[Notification Delivery Worker] ⚠️ Slot ${slotId} was already processed (status changed or deleted), skipping status update`
            );
            // Не считаем это ошибкой - уведомление было отправлено успешно
            return {
              success: true,
              devicesCount: successCount,
              alreadyProcessed: true,
            };
          }

          console.log(
            `[Notification Delivery Worker] ✅ Job ${job.id} completed: sent to ${successCount} device(s)`
          );
          return { success: true, devicesCount: successCount };
        } else {
          // КРИТИЧНО: Атомарно обновляем статус только если слот еще в статусе 'queued'
          const updateResult = await db
            .update(notificationSlots)
            .set({ status: 'failed' })
            .where(
              and(
                eq(notificationSlots.id, slotId),
                eq(notificationSlots.status, 'queued') // Только если еще queued
              )
            );

          const rowsAffected = updateResult.rowCount || 0;
          if (rowsAffected === 0) {
            // Слот уже был обработан
            console.warn(
              `[Notification Delivery Worker] ⚠️ Slot ${slotId} was already processed, skipping status update`
            );
            return {
              success: false,
              reason: 'no_devices',
              alreadyProcessed: true,
            };
          }

          console.log(
            `[Notification Delivery Worker] ⚠️ Job ${job.id} failed: no devices`
          );
          return { success: false, reason: 'no_devices' };
        }
      } catch (error) {
        // КРИТИЧНО: Атомарно обновляем статус только если слот еще в статусе 'queued'
        // Это предотвращает перезапись статуса 'sent' на 'failed' при retry после успешной отправки
        const updateResult = await db
          .update(notificationSlots)
          .set({ status: 'failed' })
          .where(
            and(
              eq(notificationSlots.id, slotId),
              eq(notificationSlots.status, 'queued') // Только если еще queued
            )
          );

        const rowsAffected = updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          // Слот уже был обработан (возможно, успешно отправлен другим воркером)
          console.warn(
            `[Notification Delivery Worker] ⚠️ Slot ${slotId} was already processed, skipping status update after error`
          );
        }

        console.error(
          `[Notification Delivery Worker] ❌ Job ${job.id} failed:`,
          error
        );
        throw error; // BullMQ сделает retry автоматически
      }
    },
    {
      // Concurrency: 10 задач параллельно
      // Отправка уведомлений быстрая (network I/O)
      // При росте нагрузки рекомендуется протестировать значения 5-20
      concurrency: 10,
    }
  );

  // Регистрируем воркер для graceful shutdown
  registerWorker(worker);

  console.log(
    `[Notification Delivery Worker] ✅ Worker started for queue: ${NOTIFICATION_DELIVERY_QUEUE}`
  );

  return worker;
}
