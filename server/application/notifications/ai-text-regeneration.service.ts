/**
 * Хелпер для постановки регенерации AI-текстов пользователя в очередь.
 * Используется при изменении глобальных параметров (tone/addressing/gender).
 */

import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  habits,
  notificationPreferences,
  therapyTopicsCustom,
  userPreferences,
  users,
} from '@/server/infrastructure/db/schema';
import { computeGenerationConfigHash } from '@/server/utils/notification-ai-config-hash';
import { enqueueAiTextGenerationJob } from '@/server/application/notifications/queues/aiTextGeneration.queue';

function resolveTone(value?: string | null) {
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

export async function enqueueAiRegenerationForUser(params: {
  userId: number;
  reason: string;
  onlyEnabled?: boolean;
}): Promise<void> {
  const { userId, reason } = params;
  const onlyEnabled = params.onlyEnabled !== false;

  const [userPrefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const tone = resolveTone(userPrefs?.tone as string | null | undefined);
  const addressing = (userPrefs?.addressing as any) || 'informal';

  const [userProfile] = await db
    .select({ gender: users.gender })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const userGender =
    userProfile?.gender === 'male' || userProfile?.gender === 'female'
      ? userProfile.gender
      : null;

  const preferences = await db
    .select({
      id: notificationPreferences.id,
      meta: notificationPreferences.meta,
      entityKey: notificationPreferences.entityKey,
      kind: notificationPreferences.kind,
      directness: notificationPreferences.directness,
      subtype: notificationPreferences.subtype,
      enabled: notificationPreferences.enabled,
      customPromptNotification: notificationPreferences.customPromptNotification,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        isNotNull(notificationPreferences.entityKey)
      )
    );

  const aiPreferences = preferences.filter((pref) => {
    const textSource = (pref.meta as { textSource?: string } | null)
      ?.textSource;
    const isAi = textSource === 'ai';
    if (!isAi) return false;
    if (onlyEnabled && !pref.enabled) return false;
    return true;
  });

  if (aiPreferences.length === 0) {
    console.log(
      `[AI Regeneration] ⏭️ Нет AI preferences для пользователя ${userId}, регенерация не требуется (${reason})`
    );
    return;
  }

  console.log(
    `[AI Regeneration] 🔄 Ставим в очередь регенерацию AI-текстов: userId=${userId}, count=${aiPreferences.length}, reason=${reason}, onlyEnabled=${onlyEnabled}`
  );

  for (const pref of aiPreferences) {
    let entityName = pref.entityKey as string;
    let entityDescription: string | null = null;
    let habitIntent: 'quit' | 'build' | null = null;

    if (pref.kind === 'habits') {
      const [habit] = await db
        .select()
        .from(habits)
        .where(
          and(eq(habits.id, pref.entityKey as string), eq(habits.userId, userId))
        )
        .limit(1);

      if (habit) {
        entityName = habit.name;
        entityDescription = habit.description;
        habitIntent = habit.intent as 'quit' | 'build' | null;
      } else {
        const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
        const catalogHabit = findHabitByKey(pref.entityKey as string);
        entityName = catalogHabit?.name || (pref.entityKey as string);
        entityDescription = catalogHabit?.description || null;
        habitIntent = catalogHabit?.intent ?? null;
      }
    } else if (pref.kind === 'therapy') {
      const [topic] = await db
        .select()
        .from(therapyTopicsCustom)
        .where(
          and(
            eq(therapyTopicsCustom.id, pref.entityKey as string),
            eq(therapyTopicsCustom.userId, userId)
          )
        )
        .limit(1);

      if (topic) {
        entityName = topic.name;
        entityDescription = topic.description;
      }
    }

    const textSource: 'ai' = 'ai';

    const configHash = computeGenerationConfigHash({
      entityName,
      entityDescription,
      tone,
      addressing,
      directness: pref.directness as 'soft' | 'moderate' | 'hard',
      subtype: (pref.subtype as
        | 'reminder'
        | 'informational'
        | 'motivational'
        | 'mixed'
        | null) ?? null,
      textSource,
      kind: pref.kind as 'habits' | 'therapy',
      habitIntent: pref.kind === 'habits' ? habitIntent : null,
      userGender,
      customPromptNotification: pref.customPromptNotification ?? null,
    });

    await enqueueAiTextGenerationJob({
      userId,
      preferenceId: pref.id,
      reason,
      configHash,
    });
  }
}
