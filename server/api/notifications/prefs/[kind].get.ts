import { eq, and, isNull, or } from 'drizzle-orm';
import {
  notificationPreferences,
  habits,
  therapyTopicsCustom,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  NotificationPreferenceMeta,
  NotificationPreferencesDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/notifications/prefs/:kind?entityKey=:key
 * Получить локальные настройки конкретного типа (therapy | habits)
 * Для habits и therapy: передаём entityKey в query
 */
export default defineEventHandler(
  async (event): Promise<NotificationPreferencesDto | null> => {
    const user = await getSessionUser(event);
    if (!user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = user.id;

    const kind = getRouterParam(event, 'kind');
    if (!kind || !['therapy', 'habits'].includes(kind)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid kind parameter',
      });
    }

    const query = getQuery(event);
    const entityKey = query.entityKey as string | undefined;

    // Строим WHERE условие с учётом entityKey
    // ВАЖНО: entityKey в query может быть как slug, так и ID
    // В БД может храниться как slug, так и ID (для обратной совместимости)
    // Поэтому ищем по обоим вариантам
    const conditions = [
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.kind, kind),
    ];

    if (entityKey) {
      // Ищем настройки, где entityKey совпадает с переданным значением (slug или ID)
      // Также проверяем, может ли переданное значение быть slug для кастомной сущности
      // или ID, который нужно сопоставить со slug в БД
      if (kind === 'habits') {
        const [habit] = await db
          .select({ id: habits.id, slug: habits.slug, intent: habits.intent })
          .from(habits)
          .where(
            and(
              or(eq(habits.id, entityKey), eq(habits.slug, entityKey)),
              eq(habits.userId, userId)
            )
          )
          .limit(1);

        if (habit) {
          // Нашли привычку - используем и ID, и slug для поиска настроек
          // (в БД может храниться любой из них)
          if (habit.slug != null && typeof habit.slug === 'string') {
            conditions.push(
              or(
                eq(notificationPreferences.entityKey, habit.id),
                eq(notificationPreferences.entityKey, habit.slug as string)
              )!
            );
          } else {
            conditions.push(eq(notificationPreferences.entityKey, habit.id));
          }
        } else {
          // Привычка не найдена - возможно, это готовый шаблон
          // Ищем напрямую по переданному значению
          conditions.push(eq(notificationPreferences.entityKey, entityKey));
        }
      } else if (kind === 'therapy') {
        // Аналогично для терапии
        const [topic] = await db
          .select({ id: therapyTopicsCustom.id, slug: therapyTopicsCustom.slug })
          .from(therapyTopicsCustom)
          .where(
            and(
              or(
                eq(therapyTopicsCustom.id, entityKey),
                eq(therapyTopicsCustom.slug, entityKey)
              ),
              eq(therapyTopicsCustom.userId, userId)
            )
          )
          .limit(1);

        if (topic) {
          // Нашли тему - используем и ID, и slug для поиска настроек
          if (topic.slug != null && typeof topic.slug === 'string') {
            conditions.push(
              or(
                eq(notificationPreferences.entityKey, topic.id),
                eq(notificationPreferences.entityKey, topic.slug as string)
              )!
            );
          } else {
            conditions.push(eq(notificationPreferences.entityKey, topic.id));
          }
        } else {
          // Тема не найдена - возможно, это готовый шаблон
          // Ищем напрямую по переданному значению
          conditions.push(eq(notificationPreferences.entityKey, entityKey));
        }
      } else {
        // Для других типов ищем напрямую по переданному значению
        conditions.push(eq(notificationPreferences.entityKey, entityKey));
      }
    } else {
      // Общие настройки (без entityKey)
      conditions.push(isNull(notificationPreferences.entityKey));
    }

    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(and(...conditions))
      .limit(1);

    if (!prefs) {
      return null;
    }

    // ВАЖНО: Нормализуем entityKey для читаемости
    // Для кастомных сущностей используем slug вместо id
    let normalizedEntityKey = prefs.entityKey;
    let isCustomHabitForResponse = false;

    if (kind === 'habits' && prefs.entityKey) {
      // Проверяем, является ли entityKey кастомной привычкой
      const [habit] = await db
        .select({ intent: habits.intent, slug: habits.slug })
        .from(habits)
        .where(
          and(
            or(eq(habits.id, prefs.entityKey), eq(habits.slug, prefs.entityKey)),
            eq(habits.userId, userId)
          )
        )
        .limit(1);

      if (habit && habit.intent === 'custom') {
        isCustomHabitForResponse = true;
        if (habit.slug) {
          // Для кастомных привычек используем slug
          normalizedEntityKey = habit.slug;
          console.log(
            `[NotificationPrefs GET] Normalized entityKey: ${prefs.entityKey} -> ${normalizedEntityKey} (custom habit)`
          );
        } else {
          // Если slug отсутствует, это проблема - но возвращаем как есть
          console.warn(
            `[NotificationPrefs GET] ⚠️ Custom habit ${prefs.entityKey} has no slug! This should not happen.`
          );
        }
      }
      // Для готовых шаблонов entityKey уже читаемый (water, meditation и т.д.)
    } else if (kind === 'therapy' && prefs.entityKey) {
      // Для терапии проверяем, является ли entityKey кастомной темой
      const [topic] = await db
        .select({ slug: therapyTopicsCustom.slug })
        .from(therapyTopicsCustom)
        .where(
          and(
            or(
              eq(therapyTopicsCustom.id, prefs.entityKey),
              eq(therapyTopicsCustom.slug, prefs.entityKey)
            ),
            eq(therapyTopicsCustom.userId, userId)
          )
        )
        .limit(1);

      if (topic && topic.slug) {
        // Для кастомных тем используем slug
        normalizedEntityKey = topic.slug;
        console.log(
          `[NotificationPrefs GET] Normalized entityKey: ${prefs.entityKey} -> ${normalizedEntityKey} (custom therapy)`
        );
      }
      // Для готовых шаблонов entityKey уже читаемый
    }

    // ВАЖНО: Для кастомных привычек subtype всегда null в ответе
    const responseSubtype = isCustomHabitForResponse
      ? null
      : (prefs.subtype as 'reminder' | 'informational' | 'motivational' | null);

    const response = {
      id: prefs.id,
      userId: prefs.userId,
      kind: prefs.kind as 'therapy' | 'habits',
      entityKey: normalizedEntityKey ?? null, // Всегда читаемый (slug для кастомных сущностей)
      enabled: prefs.enabled,
      timesPerDay: prefs.timesPerDay,
      directness: prefs.directness as 'soft' | 'moderate' | 'hard',
      timezone: prefs.timezone,
      subtype: responseSubtype, // Всегда null для кастомных привычек
      activeDays: (prefs.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
      customSlotTimes:
        (prefs.customSlotTimes as (number | null)[] | null) ?? null,
      timeRangeStart: prefs.timeRangeStart,
      timeRangeEnd: prefs.timeRangeEnd,
      meta: (prefs.meta as NotificationPreferenceMeta | null) ?? null,
      createdAt: prefs.createdAt.toISOString(),
      updatedAt: prefs.updatedAt.toISOString(),
    };

    return response;
  }
);
