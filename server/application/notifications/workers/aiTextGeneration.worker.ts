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
  Tone,
} from '@/shared/dto/notifications';

function resolveTone(value?: string | null): Tone {
  if (
    value === 'delicate' ||
    value === 'neutral' ||
    value === 'uplifting' ||
    value === 'resolute' ||
    value === 'demanding'
  ) {
    return value;
  }
  return 'neutral';
}

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

  const tone = resolveTone(userPrefs?.tone as string | null | undefined);
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
      const attemptsMade = job.attemptsMade ?? 0;

      console.log(
        `[AI Generation Worker] ▶️ Processing job ${job.id} for preference ${preferenceId}`
      );

      try {
        // КРИТИЧНО: Проверяем пользователя
        const [user] = await db
          .select({ id: users.id, isBlocked: users.isBlocked, gender: users.gender })
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
        const normalizedTextSource: 'ai' = 'ai';

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

        // Перегенерируем слоты только после успешной генерации AI-текстов
        await generateAllSlotsForUser(userId, {
          forceTodaySlots: true,
        });

        console.log(
          `[AI Generation Worker] ✅ Slots regenerated after AI generation for preference ${preferenceId}`
        );

        return { success: true, textsGenerated: result.texts.length };
      } catch (error) {
        console.error(
          `[AI Generation Worker] ❌ Job ${job.id} failed:`,
          error
        );

        // Если это повторяемая ошибка провайдера и попытки исчерпаны — ставим новую задачу с задержкой
        const attemptsLimit = job.opts?.attempts ?? 1;
        const isLastAttempt = attemptsMade + 1 >= attemptsLimit;

        if (isRetryableQueueError(error) && isLastAttempt) {
          const delayMs = 15 * 60 * 1000;
          await enqueueAiTextGenerationJob({
            userId,
            preferenceId,
            reason: 'retry_after_provider_error',
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
