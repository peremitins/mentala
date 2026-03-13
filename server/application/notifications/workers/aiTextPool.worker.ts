/**
 * Воркер для обработки задач догенерации AI-текстов
 * @version BullMQ 5.x (без QueueScheduler)
 */

import type { Job } from 'bullmq';
import {
  createWorker,
  registerWorker,
} from '@/server/infrastructure/redis/bullmqClient';
import {
  AI_TEXT_POOL_QUEUE,
  type AiTextPoolRefillJobData,
} from '../queues/aiTextPool.queue';
import { refillTextPool } from '@/server/application/notifications/ai-generation.service';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationPreferences,
  userPreferences,
  users,
} from '@/server/infrastructure/db/schema';
import { eq, and } from 'drizzle-orm';
import { computeGenerationConfigHash } from '@@/server/utils/notification-ai-config-hash';
import type {
  Addressing,
  Directness,
  HabitSubtype,
} from '@/shared/dto/notifications';
import { ensureAiNotificationAccessConsistency } from '@/server/application/notifications/notification-source-access.service';
import { resolveAssistantTone } from '@/shared/constants/assistantTone';

/**
 * Запускает воркер для обработки задач догенерации AI-текстов
 */
export function startAiTextPoolWorker() {
  const worker = createWorker<AiTextPoolRefillJobData>(
    AI_TEXT_POOL_QUEUE,
    async (job: Job<AiTextPoolRefillJobData>) => {
      const { preferenceId, userId } = job.data;

      console.log(
        `[AI Text Pool Worker] ▶️ Processing job ${job.id} for preference ${preferenceId}`
      );

      try {
        // Загружаем preference
        const [pref] = await db
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.id, preferenceId))
          .limit(1);

        if (!pref) {
          throw new Error(`Preference ${preferenceId} not found`);
        }

        const [userProfile] = await db
          .select({
            gender: users.gender,
            roleId: users.roleId,
            trialEndedAt: users.trialEndedAt,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        // Важно: entitlement проверяем внутри воркера.
        // Если Trial закончился, переключаем AI-настройки в templates и не продолжаем генерацию.
        const aiAccess = await ensureAiNotificationAccessConsistency({
          userId,
          trialEndedAt: userProfile?.trialEndedAt ?? null,
          userRole: userProfile?.roleId ?? null,
        });
        if (!aiAccess.canUseAiNotifications) {
          console.log(
            `[AI Text Pool Worker] ⏭️ AI notifications access disabled for user ${userId}, skipping job ${job.id}`
          );
          return { skipped: true, reason: 'ai_access_disabled' };
        }

        // Проверяем, используется ли AI-генерация
        const meta = (pref.meta || {}) as any;
        const textSource = meta.textSource;
        if (textSource !== 'ai') {
          console.log(
            `[AI Text Pool Worker] ⏭️ Skipping preference ${preferenceId} (textSource: ${textSource})`
          );
          return { skipped: true, reason: 'not_ai' };
        }

        // Загружаем настройки пользователя
        const [userPrefs] = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);

        const tone = resolveAssistantTone(
          userPrefs?.tone as string | null | undefined
        );
        const addressing: Addressing =
          (userPrefs?.addressing as Addressing) || 'informal';
        const directness = (pref.directness as Directness) || 'moderate';
        const subtype = (pref.subtype as HabitSubtype | null) || null;

        const userGender =
          userProfile?.gender === 'male' || userProfile?.gender === 'female'
            ? userProfile.gender
            : null;

        // Загружаем данные о сущности для вычисления configHash
        let entityName = '';
        let entityDescription: string | null = null;
        let habitIntent: 'quit' | 'build' | null = null;

        if (pref.kind === 'habits') {
          const { habits } = await import('@@/server/infrastructure/db/schema');
          const [habit] = await db
            .select()
            .from(habits)
            .where(
              and(eq(habits.id, pref.entityKey!), eq(habits.userId, userId))
            )
            .limit(1);

          if (habit) {
            entityName = habit.name;
            entityDescription = habit.description;
            habitIntent = habit.intent as 'quit' | 'build' | null;
          } else {
            const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
            const catalogHabit = findHabitByKey(pref.entityKey!);
            entityName = catalogHabit ? catalogHabit.name : pref.entityKey!;
            habitIntent = catalogHabit ? catalogHabit.intent : null;
          }
        } else {
          const { therapyTopicsCustom } = await import(
            '@@/server/infrastructure/db/schema'
          );
          const [topic] = await db
            .select()
            .from(therapyTopicsCustom)
            .where(
              and(
                eq(therapyTopicsCustom.id, pref.entityKey!),
                eq(therapyTopicsCustom.userId, userId)
              )
            )
            .limit(1);

          if (topic) {
            entityName = topic.name;
            entityDescription = topic.description;
          } else {
            entityName = pref.entityKey!;
          }
        }

        // КРИТИЧНО: habitIntent должен быть включен в хеш, чтобы при изменении intent генерировался новый пул текстов
        const configHash = computeGenerationConfigHash({
          entityName,
          entityDescription,
          tone,
          addressing,
          directness,
          subtype,
          textSource: 'ai',
          kind: pref.kind as 'habits' | 'therapy',
          habitIntent: pref.kind === 'habits' ? habitIntent : null, // Включаем intent только для habits
          userGender,
          customPromptNotification: pref.customPromptNotification ?? null,
        });

        // Вызываем функцию догенерации
        const result = await refillTextPool(
          userId,
          preferenceId,
          pref.kind as 'habits' | 'therapy',
          pref.entityKey!,
          configHash,
          directness,
          subtype,
          'ai',
          habitIntent, // Передаем intent для формирования правильных инструкций
          pref.customPromptNotification ?? null
        );

        if (result) {
          console.log(
            `[AI Text Pool Worker] ✅ Job ${job.id} completed: generated ${result.texts.length} texts`
          );
          return { success: true, textsGenerated: result.texts.length };
        }

        console.log(
          `[AI Text Pool Worker] ⏭️ Job ${job.id} skipped: pool is full or no refill needed`
        );
        return { skipped: true, reason: 'pool_full' };
      } catch (error) {
        console.error(`[AI Text Pool Worker] ❌ Job ${job.id} failed:`, error);
        throw error; // BullMQ сделает retry автоматически
      }
    },
    {
      // Concurrency: 3 задачи параллельно
      // Выбрано исходя из лимитов OpenAI API и нагрузки на БД
      // При росте нагрузки рекомендуется протестировать значения 1-5
      concurrency: 3,
    }
  );

  // Регистрируем воркер для graceful shutdown
  registerWorker(worker);

  console.log(
    `[AI Text Pool Worker] ✅ Worker started for queue: ${AI_TEXT_POOL_QUEUE}`
  );

  return worker;
}
