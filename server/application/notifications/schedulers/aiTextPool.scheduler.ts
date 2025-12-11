/**
 * Планировщик для постановки задач догенерации AI-текстов в очередь
 */

import { aiTextPoolQueue } from '../queues/aiTextPool.queue';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

/**
 * Ставит задачи в очередь для всех активных preferences с AI-генерацией
 */
export async function enqueueAiTextPoolRefillForAllActivePreferences(): Promise<void> {
  console.log(
    '[AI Text Pool Scheduler] 🔄 Starting enqueue for all active preferences'
  );

  try {
    // Находим все активные preferences с AI-генерацией
    const activePrefs = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.enabled, true),
          isNotNull(notificationPreferences.entityKey)
        )
      );

    console.log(
      `[AI Text Pool Scheduler] Found ${activePrefs.length} active notification preferences`
    );

    let enqueuedCount = 0;
    let skippedCount = 0;

    for (const pref of activePrefs) {
      try {
        // Проверяем, используется ли AI-генерация
        const meta = (pref.meta || {}) as any;
        const textSource = meta.textSource;
        if (textSource !== 'ai' && textSource !== 'hybrid') {
          skippedCount++;
          continue;
        }

        // Ставим задачу в очередь с детерминированным jobId
        // Один preference = одна задача в очереди (защита от дублей)
        await aiTextPoolQueue.add(
          'refill',
          {
            preferenceId: pref.id,
            userId: pref.userId,
          },
          {
            jobId: `ai-refill-${pref.id}`, // Детерминированный ID по preference
            removeOnComplete: true,
            removeOnFail: false,
          }
        );

        enqueuedCount++;
      } catch (error) {
        console.error(
          `[AI Text Pool Scheduler] ❌ Error enqueueing preference ${pref.id}:`,
          error
        );
      }
    }

    console.log(
      `[AI Text Pool Scheduler] ✅ Completed: enqueued=${enqueuedCount}, skipped=${skippedCount}`
    );
  } catch (error) {
    console.error('[AI Text Pool Scheduler] ❌ Fatal error:', error);
    throw error;
  }
}
