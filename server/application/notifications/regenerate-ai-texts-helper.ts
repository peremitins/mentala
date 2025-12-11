/**
 * Хелпер для перегенерации AI-текстов при изменении сущности
 * Используется в PUT endpoint'ах для habits и therapy
 */

import { eq, and } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationPreferences,
  userPreferences,
} from '@/server/infrastructure/db/schema';
import { generateNotificationTexts } from './ai-generation.service';
import { computeGenerationConfigHash } from '@/server/utils/notification-ai-config-hash';
import type { NotificationPreferenceMeta } from '@/shared/dto/notifications';

/**
 * Перегенерирует AI-тексты для всех preferences сущности при изменении названия/описания
 * или других чувствительных параметров
 */
export async function regenerateAiTextsForEntity(params: {
  userId: number | string; // Принимаем и number, и string для совместимости
  kind: 'habits' | 'therapy';
  entityKey: string; // ID для кастомных сущностей
  entityName: string;
  entityDescription: string | null;
}): Promise<void> {
  const { userId, kind, entityKey, entityName, entityDescription } = params;
  const userIdStr = String(userId); // Преобразуем в строку для использования в запросах

  try {
    // Находим все preferences для этой сущности
    const preferences = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, Number(userId)), // Преобразуем в number для БД
          eq(notificationPreferences.kind, kind),
          eq(notificationPreferences.entityKey, entityKey)
        )
      );

    if (preferences.length === 0) {
      console.log(
        `[RegenerateAI] No preferences found for entity: kind=${kind}, entityKey=${entityKey}`
      );
      return;
    }

    // Загружаем глобальные настройки пользователя
    const [userPrefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, Number(userId))) // Преобразуем в number для БД
      .limit(1);

    const tone = (userPrefs?.tone as any) || 'neutral';
    const addressing = (userPrefs?.addressing as any) || 'informal';

    console.log(
      `[RegenerateAI] Found ${preferences.length} preferences for regeneration: kind=${kind}, entityKey=${entityKey}, entityName="${entityName}"`
    );

    // Определяем habitIntent для привычек (один раз для всех preferences)
    let habitIntent: 'quit' | 'build' | null = null;
    if (kind === 'habits') {
      // Для кастомных сущностей entityKey = ID
      const { habits } = await import('@/server/infrastructure/db/schema');
      const { eq, and } = await import('drizzle-orm');
      const [habit] = await db
        .select()
        .from(habits)
        .where(and(eq(habits.id, entityKey), eq(habits.userId, Number(userId))))
        .limit(1);
      if (habit) {
        habitIntent = habit.intent as 'quit' | 'build' | null;
      } else {
        // Готовый шаблон - берем intent из каталога
        const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
        const catalogHabit = findHabitByKey(entityKey);
        habitIntent = catalogHabit ? catalogHabit.intent : null;
      }
    }

    // Перегенерируем AI-тексты для каждого preference
    const regenerationPromises: Promise<void>[] = [];

    for (const pref of preferences) {
      const meta = (pref.meta as NotificationPreferenceMeta | null) || {};
      const textSource = meta.textSource;

      // Перегенерируем только если используется AI или hybrid
      if (textSource !== 'ai' && textSource !== 'hybrid') {
        console.log(
          `[RegenerateAI] Skipping preference ${pref.id}: textSource=${textSource} (not AI/hybrid)`
        );
        continue;
      }

      // Определяем, кастомная ли это сущность (для subtype)
      // Для кастомных привычек subtype всегда null
      const isCustomEntity = kind === 'habits' || kind === 'therapy';
      const subtypeForHash = isCustomEntity ? null : (pref.subtype as any);

      // Вычисляем новый хеш конфигурации
      // КРИТИЧНО: habitIntent должен быть включен в хеш, чтобы при изменении intent генерировался новый пул текстов
      const newConfigHash = computeGenerationConfigHash({
        entityName,
        entityDescription,
        tone,
        addressing,
        directness: pref.directness as 'soft' | 'moderate' | 'hard',
        subtype: subtypeForHash as
          | 'reminder'
          | 'informational'
          | 'motivational'
          | 'mixed'
          | null,
        textSource: textSource as 'ai' | 'hybrid',
        kind,
        habitIntent: kind === 'habits' ? habitIntent : null, // Включаем intent только для habits
      });

      console.log(
        `[RegenerateAI] Regenerating AI texts for preference ${pref.id}: newHash=${newConfigHash.substring(0, 8)}..., directness=${pref.directness}, subtype=${subtypeForHash}`
      );

      // Запускаем генерацию и сохраняем промис
      const regenerationPromise = generateNotificationTexts({
        userId: Number(userId), // Преобразуем в number для функции
        preferenceId: pref.id,
        kind,
        entityKey, // ID для кастомных сущностей
        directness: pref.directness as 'soft' | 'moderate' | 'hard',
        subtype: subtypeForHash as
          | 'reminder'
          | 'informational'
          | 'motivational'
          | 'mixed'
          | null,
        textSource: textSource as 'ai' | 'hybrid',
        count: 50, // ВАЖНО: Всегда 50 текстов при перегенерации
        habitIntent: kind === 'habits' ? habitIntent : undefined, // Передаем intent для привычек
      })
        .then((result) => {
          console.log(
            `[RegenerateAI] ✅ AI texts regenerated for preference ${pref.id}: ${result.texts.length} texts, provider: ${result.provider}, model: ${result.model}`
          );
        })
        .catch((error) => {
          console.error(
            `[RegenerateAI] ❌ Failed to regenerate AI texts for preference ${pref.id}:`,
            error
          );
          throw error; // Пробрасываем ошибку, чтобы Promise.allSettled мог её обработать
        });

      regenerationPromises.push(regenerationPromise);
    }

    // Ждем завершения всех перегенераций AI-текстов
    if (regenerationPromises.length > 0) {
      console.log(
        `[RegenerateAI] Waiting for ${regenerationPromises.length} AI text regeneration(s) to complete...`
      );
      const results = await Promise.allSettled(regenerationPromises);
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      console.log(
        `[RegenerateAI] AI text regeneration completed: ${successful} successful, ${failed} failed`
      );

      // КРИТИЧНО: После перегенерации всех AI-текстов нужно перегенерировать слоты ОДИН РАЗ для всей сущности
      // Это удалит старые слоты со старым названием и создаст новые с новым названием
      if (successful > 0) {
        console.log(
          `[RegenerateAI] Regenerating slots for entity: kind=${kind}, entityKey=${entityKey}`
        );
        const { regenerateSlotsForSource } = await import(
          '@/server/application/notifications/scheduler.service'
        );
        // Небольшая задержка, чтобы убедиться, что все AI-тексты сохранились в БД
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          await regenerateSlotsForSource(Number(userId), kind, {
            entityKey, // ID для кастомных сущностей
          });
          console.log(
            `[RegenerateAI] ✅ Slots regenerated for entity: kind=${kind}, entityKey=${entityKey}`
          );
        } catch (error) {
          console.error(
            `[RegenerateAI] ❌ Failed to regenerate slots for entity: kind=${kind}, entityKey=${entityKey}:`,
            error
          );
        }
      }
    } else {
      console.log(
        `[RegenerateAI] No preferences with AI/hybrid textSource found, skipping regeneration`
      );
    }
  } catch (error) {
    console.error(
      `[RegenerateAI] ❌ Error during AI texts regeneration:`,
      error
    );
    // Не пробрасываем ошибку, чтобы не сломать основной endpoint
  }
}
