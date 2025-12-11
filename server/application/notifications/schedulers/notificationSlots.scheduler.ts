/**
 * Планировщик для постановки задач генерации слотов в очередь
 */

import { notificationSlotsQueue } from '../queues/notificationSlots.queue';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Ставит задачи в очередь для всех пользователей с активными preferences
 */
export async function enqueueSlotGenerationForAllActiveUsers(): Promise<void> {
  console.log(
    '[Notification Slots Scheduler] 🔄 Starting enqueue for all active users'
  );

  try {
    // Получаем уникальные userId с активными preferences
    const activeUsers = await db
      .select({ userId: notificationPreferences.userId })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.enabled, true))
      .groupBy(notificationPreferences.userId);

    console.log(
      `[Notification Slots Scheduler] Found ${activeUsers.length} users with active notifications`
    );

    let enqueuedCount = 0;

    for (const { userId } of activeUsers) {
      try {
        // Ставим задачу в очередь с детерминированным jobId
        // Один пользователь = одна задача генерации в очереди (защита от дублей)
        await notificationSlotsQueue.add(
          'generate',
          { userId },
          {
            jobId: `slots-${userId}`, // Детерминированный ID по пользователю
            removeOnComplete: true,
            removeOnFail: false,
          }
        );

        enqueuedCount++;
      } catch (error) {
        console.error(
          `[Notification Slots Scheduler] ❌ Error enqueueing user ${userId}:`,
          error
        );
      }
    }

    console.log(
      `[Notification Slots Scheduler] ✅ Completed: enqueued=${enqueuedCount}`
    );
  } catch (error) {
    console.error('[Notification Slots Scheduler] ❌ Fatal error:', error);
    throw error;
  }
}
