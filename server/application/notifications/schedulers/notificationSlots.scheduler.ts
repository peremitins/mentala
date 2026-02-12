/**
 * Планировщик для постановки задач генерации слотов уведомлений в очередь
 *
 * Периодически ставит задачи для всех пользователей с активными настройками.
 * Воркер notificationSlots проверит needsSlotRegeneration и выполнит генерацию
 * только если слотов не хватает (planned < 80% от ожидаемого).
 *
 * Без этого планировщика слоты не пополняются после того, как все отправлены:
 * - Горизонт планирования: 2 дня (сегодня + завтра)
 * - Через 2 дня таблица слотов пустеет
 * - Регенерация раньше срабатывала только при: логине, смене настроек
 * - При отсутствии активности пользователя слоты не восстанавливались
 */

import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import { notificationSlotsQueue } from '../queues/notificationSlots.queue';

/**
 * Ставит задачи генерации слотов для всех пользователей с активными настройками
 */
export async function enqueueSlotGenerationForAllActiveUsers(): Promise<void> {
  console.log(
    '[Notification Slots Scheduler] 🔄 Starting enqueue for all active users'
  );

  try {
    // Уникальные userId с активными настройками
    const activeUserRows = await db
      .select({ userId: notificationPreferences.userId })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.enabled, true));

    const userIds = [...new Set(activeUserRows.map((r) => r.userId))];
    console.log(
      `[Notification Slots Scheduler] Found ${userIds.length} users with active preferences`
    );

    let enqueuedCount = 0;
    let errorCount = 0;

    for (const userId of userIds) {
      try {
        await notificationSlotsQueue.add(
          'generate',
          { userId },
          {
            jobId: `slots-${userId}`,
            removeOnComplete: true,
          }
        );
        enqueuedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('already exists')) {
          // Задача уже в очереди — нормально, пропускаем
          continue;
        }
        errorCount++;
        console.error(
          `[Notification Slots Scheduler] ❌ Error enqueueing user ${userId}:`,
          error
        );
      }
    }

    console.log(
      `[Notification Slots Scheduler] ✅ Completed: enqueued=${enqueuedCount}, errors=${errorCount}, total=${userIds.length}`
    );
  } catch (error) {
    console.error(
      '[Notification Slots Scheduler] ❌ Fatal error:',
      error
    );
    throw error;
  }
}
