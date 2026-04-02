/**
 * Воркер для первичной генерации AI-текстов
 * @version BullMQ 5.x (без QueueScheduler)
 */

import type { Job } from 'bullmq';
import {
  createWorker,
  registerWorker,
} from '@/server/infrastructure/redis/bullmqClient';
import {
  AI_TEXT_GENERATION_QUEUE,
  type AiTextGenerationJobData,
} from '../queues/aiTextGeneration.queue';
import { enqueueAiTextGenerationJob } from '@/server/application/notifications/queues/aiTextGeneration.queue';
import { generateNotificationTexts } from '@/server/application/notifications/ai-generation.service';
import { generateAllSlotsForUser } from '@/server/application/notifications/scheduler.service';
import { db } from '@/server/infrastructure/db/client';
import {
  habits,
  notificationPreferences,
  therapyTopicsCustom,
  userPreferences,
  users,
} from '@/server/infrastructure/db/schema';
import { and, eq } from 'drizzle-orm';
import { computeGenerationConfigHash } from '@/server/utils/notification-ai-config-hash';
import type {
  Addressing,
  Directness,
  HabitSubtype,
} from '@/shared/dto/notifications';
import { ensureAiNotificationAccessConsistency } from '@/server/application/notifications/notification-source-access.service';
import {
  resolveSlotsRegenerationReasonFromAiReason,
  shouldRegenerateSlotsAfterAiGeneration,
} from '@/server/application/notifications/ai-slot-regeneration-reason.utils';
import { resolveAssistantTone } from '@/shared/constants/assistantTone';

function isRetryableQueueError(error: any): boolean {
  const status =
    error?.status || error?.response?.status || error?.statusCode || null;
  if (status === 429) return true;
  if (status && Number(status) >= 500 && Number(status) < 600) return true;

  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('bad gateway') ||
    message.includes('gateway') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('upstream')
  );
}

function resolveGenerationCount(attemptsMade: number): number {
  if (attemptsMade >= 2) return 12;
  if (attemptsMade >= 1) return 25;
  return 50;
}

async function computeCurrentConfigHash(params: {
  userId: number;
  preference: typeof notificationPreferences.$inferSelect;
  textSource: 'ai';
  userGender: 'male' | 'female' | null;
}): Promise<string> {
  const { userId, preference, textSource, userGender } = params;

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

  const normalizedGender =
    userGender === 'male' || userGender === 'female' ? userGender : null;

  const directness = preference.directness as Directness;
  const subtype = (preference.subtype as HabitSubtype | null) ?? null;

  let entityName = '';
  let entityDescription: string | null = null;
  let habitIntent: 'quit' | 'build' | null = null;

  if (preference.kind === 'habits') {
    const [habit] = await db
      .select()
      .from(habits)
      .where(
        and(eq(habits.id, preference.entityKey!), eq(habits.userId, userId))
      )
      .limit(1);

    if (habit) {
      entityName = habit.name;
      entityDescription = habit.description;
      habitIntent = habit.intent as 'quit' | 'build' | null;
    } else {
      const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
      const catalogHabit = findHabitByKey(preference.entityKey!);
      entityName = catalogHabit?.name || preference.entityKey!;
      entityDescription = catalogHabit?.description || null;
      habitIntent = catalogHabit?.intent ?? null;
    }
  } else {
    const [topic] = await db
      .select()
      .from(therapyTopicsCustom)
      .where(
        and(
          eq(therapyTopicsCustom.id, preference.entityKey!),
          eq(therapyTopicsCustom.userId, userId)
        )
      )
      .limit(1);

    if (topic) {
      entityName = topic.name;
      entityDescription = topic.description;
    } else {
      entityName = preference.entityKey!;
    }
  }

  return computeGenerationConfigHash({
    entityName,
    entityDescription,
    tone,
    addressing,
    directness,
    subtype,
    textSource,
    kind: preference.kind as 'habits' | 'therapy',
    habitIntent: preference.kind === 'habits' ? habitIntent : null,
    userGender: normalizedGender,
    customPromptNotification: preference.customPromptNotification ?? null,
  });
}

/**
 * Запускает воркер для генерации AI-текстов
 */
export function startAiTextGenerationWorker() {
  const worker = createWorker<AiTextGenerationJobData>(
    AI_TEXT_GENERATION_QUEUE,
    async (job: Job<AiTextGenerationJobData>) => {
      const { userId, preferenceId } = job.data;
      const jobReason = job.data.reason ?? null;
      const attemptsMade = job.attemptsMade ?? 0;

      console.log(
        `[AI Generation Worker] ▶️ Processing job ${job.id} for preference ${preferenceId} (reason=${jobReason ?? 'unknown'})`
      );

      try {
        // КРИТИЧНО: Проверяем пользователя
        const [user] = await db
          .select({
            id: users.id,
            isBlocked: users.isBlocked,
            gender: users.gender,
            roleId: users.roleId,
            trialEndedAt: users.trialEndedAt,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!user) {
          console.warn(
            `[AI Generation Worker] ❌ User ${userId} not found, skipping job ${job.id}`
          );
          return { skipped: true, reason: 'user_not_found' };
        }

        if (user.isBlocked) {
          console.warn(
            `[AI Generation Worker] ❌ User ${userId} is blocked, skipping job ${job.id}`
          );
          return { skipped: true, reason: 'user_blocked' };
        }

        // Важно: entitlement проверяем в самом воркере, чтобы после окончания Trial
        // новые AI-генерации не продолжались в фоне без открытия настроек.
        const aiAccess = await ensureAiNotificationAccessConsistency({
          userId,
          userRole: user.roleId,
        });
        if (!aiAccess.canUseAiNotifications) {
          console.log(
            `[AI Generation Worker] ⏭️ AI notifications access disabled for user ${userId}, skipping job ${job.id}`
          );
          return { skipped: true, reason: 'ai_access_disabled' };
        }

        // Загружаем preference
        const [pref] = await db
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.id, preferenceId))
          .limit(1);

        if (!pref) {
          console.warn(
            `[AI Generation Worker] ❌ Preference ${preferenceId} not found, skipping job ${job.id}`
          );
          return { skipped: true, reason: 'preference_not_found' };
        }

        if (pref.userId !== userId) {
          console.warn(
            `[AI Generation Worker] ❌ Preference ${preferenceId} does not belong to user ${userId}, skipping job ${job.id}`
          );
          return { skipped: true, reason: 'user_mismatch' };
        }

        if (!pref.enabled) {
          console.log(
            `[AI Generation Worker] ⏭️ Preference ${preferenceId} disabled, skipping job ${job.id}`
          );
          return { skipped: true, reason: 'preference_disabled' };
        }

        const meta = (pref.meta || {}) as any;
        const textSource = meta.textSource || 'templates';

        if (textSource !== 'ai') {
          console.log(
            `[AI Generation Worker] ⏭️ Preference ${preferenceId} is not AI (textSource=${textSource}), skipping job ${job.id}`
          );
          return { skipped: true, reason: 'not_ai' };
        }
        const normalizedTextSource = 'ai' as const;

        const expectedConfigHash = job.data.configHash;
        if (expectedConfigHash) {
          const currentConfigHash = await computeCurrentConfigHash({
            userId,
            preference: pref,
            textSource: normalizedTextSource,
            userGender:
              user.gender === 'male' || user.gender === 'female'
                ? user.gender
                : null,
          });

          if (currentConfigHash !== expectedConfigHash) {
            console.log(
              `[AI Generation Worker] ⏭️ Job ${job.id} устарел (expected=${expectedConfigHash.substring(0, 8)}..., current=${currentConfigHash.substring(0, 8)}...), пропускаем`
            );
            return { skipped: true, reason: 'stale_config' };
          }
        }

        if (!pref.entityKey) {
          console.warn(
            `[AI Generation Worker] ❌ Preference ${preferenceId} has no entityKey, skipping job ${job.id}`
          );
          return { skipped: true, reason: 'missing_entity_key' };
        }

        // При повторных ошибках уменьшаем объём генерации, чтобы повысить устойчивость
        const generationCount = resolveGenerationCount(attemptsMade);
        if (generationCount !== 50) {
          console.warn(
            `[AI Generation Worker] ⚠️ Reduce AI count to ${generationCount} (attemptsMade=${attemptsMade}) for preference ${preferenceId}`
          );
        }

        // Генерируем AI-тексты по текущим настройкам preference
        const result = await generateNotificationTexts({
          userId,
          preferenceId,
          kind: pref.kind as 'habits' | 'therapy',
          entityKey: pref.entityKey,
          directness: pref.directness as 'soft' | 'moderate' | 'hard',
          subtype: (pref.subtype as HabitSubtype | null) ?? null,
          textSource: normalizedTextSource,
          count: generationCount,
          customPromptNotification: pref.customPromptNotification ?? null,
        });

        console.log(
          `[AI Generation Worker] ✅ Generated ${result.texts.length} texts for preference ${preferenceId}`
        );

        // Небольшая задержка, чтобы тексты точно сохранились в БД
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Критично: не пересчитываем слоты по фоновым причинам (например, missing_ai_texts),
        // чтобы расписание не менялось "само" без действий пользователя.
        const regenTriggered =
          shouldRegenerateSlotsAfterAiGeneration(jobReason);
        const regenReason = regenTriggered
          ? resolveSlotsRegenerationReasonFromAiReason(jobReason)
          : null;

        if (regenTriggered) {
          await generateAllSlotsForUser(userId, {
            forceTodaySlots: true,
            reason: regenReason,
          });

          console.log(
            `[AI Generation Worker] ✅ Slots regenerated after AI generation for preference ${preferenceId} (reason=${jobReason})`
          );
        } else {
          console.log(
            `[AI Generation Worker] ⏭️ Slots regeneration skipped after AI generation for preference ${preferenceId} (reason=${jobReason ?? 'unknown'})`
          );
        }

        // Structured-log для прод-диагностики: кто и почему триггернул (или не триггернул) регенерацию слотов.
        console.log(
          JSON.stringify({
            event: 'notification_ai_generation_completed',
            user_id: userId,
            preference_id: preferenceId,
            job_id: String(job.id),
            reason: jobReason ?? 'unknown',
            regenTriggered,
            regen_reason: regenReason,
            texts_generated: result.texts.length,
            attempts_made: attemptsMade,
          })
        );

        return { success: true, textsGenerated: result.texts.length };
      } catch (error) {
        console.error(`[AI Generation Worker] ❌ Job ${job.id} failed:`, error);

        // Если это повторяемая ошибка провайдера и попытки исчерпаны — ставим новую задачу с задержкой
        const attemptsLimit = job.opts?.attempts ?? 1;
        const isLastAttempt = attemptsMade + 1 >= attemptsLimit;

        if (isRetryableQueueError(error) && isLastAttempt) {
          const delayMs = 15 * 60 * 1000;
          await enqueueAiTextGenerationJob({
            userId,
            preferenceId,
            // Сохраняем исходную причину, чтобы не потерять контекст и поведение.
            reason: jobReason ?? 'retry_after_provider_error',
            configHash: job.data.configHash,
            delayMs,
          });

          console.warn(
            `[AI Generation Worker] ⏳ Provider error, rescheduled job for preference ${preferenceId} in ${Math.round(
              delayMs / 1000
            )}s`
          );

          return { rescheduled: true, delayMs };
        }

        throw error; // BullMQ сделает retry автоматически
      }
    },
    {
      // Конкурентность ниже, чтобы не перегружать LLM/БД
      concurrency: 2,
    }
  );

  // Регистрируем воркер для graceful shutdown
  registerWorker(worker);

  console.log(
    `[AI Generation Worker] ✅ Worker started for queue: ${AI_TEXT_GENERATION_QUEUE}`
  );

  return worker;
}
