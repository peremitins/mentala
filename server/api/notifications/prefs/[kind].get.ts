import { eq, and, isNull } from 'drizzle-orm';
import {
  notificationPreferences,
  habits,
  therapyTopicsCustom,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  NotificationPreferenceMeta,
  NotificationPreferencesDto,
  NotificationSubtype,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/notifications/prefs/:kind?entityKey=:key
 * Получить локальные настройки конкретного типа (therapy | habits)
 * Для habits и therapy: передаём entityKey в query
 */
export default defineEventHandler(
  async (event): Promise<NotificationPreferencesDto | null> => {
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionResult.user.id;

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
    // ВАЖНО: Для кастомных сущностей entityKey = ID, для шаблонных = ключ шаблона
    const conditions = [
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.kind, kind),
    ];

    if (entityKey) {
      // Для кастомных сущностей entityKey = ID, для шаблонных = ключ шаблона
      if (kind === 'habits') {
        // Проверяем, является ли entityKey кастомной привычкой (поиск только по ID)
        const [habit] = await db
          .select({ id: habits.id, intent: habits.intent })
          .from(habits)
          .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
          .limit(1);

        if (habit) {
          // Нашли привычку в БД - это кастомная, используем ID
          conditions.push(eq(notificationPreferences.entityKey, habit.id));
        } else {
          // Не нашли в БД - значит это шаблон (water, meditation и т.д.)
          // Используем entityKey как есть (ключ шаблона)
          conditions.push(eq(notificationPreferences.entityKey, entityKey));
        }
      } else if (kind === 'therapy') {
        // Проверяем, является ли entityKey кастомной темой (поиск только по ID)
        const [topic] = await db
          .select({ id: therapyTopicsCustom.id })
          .from(therapyTopicsCustom)
          .where(
            and(
              eq(therapyTopicsCustom.id, entityKey),
              eq(therapyTopicsCustom.userId, userId)
            )
          )
          .limit(1);

        if (topic) {
          // Нашли тему в БД - это кастомная, используем ID
          conditions.push(eq(notificationPreferences.entityKey, topic.id));
        } else {
          // Не нашли в БД - значит это шаблон
          // Используем entityKey как есть (ключ шаблона)
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

    // Упрощенная логика: entityKey уже нормализован в БД
    const normalizedEntityKey = prefs.entityKey;

    const response = {
      id: prefs.id,
      userId: prefs.userId,
      kind: prefs.kind as 'therapy' | 'habits',
      entityKey: normalizedEntityKey ?? null, // ID для кастомных, ключ шаблона для шаблонных
      enabled: prefs.enabled,
      timesPerDay: prefs.timesPerDay,
      directness: prefs.directness as 'soft' | 'moderate' | 'hard',
      timezone: prefs.timezone,
      subtype: prefs.subtype as NotificationSubtype | null, // Возвращаем subtype для всех типов
      activeDays: (prefs.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
      customSlotTimes:
        (prefs.customSlotTimes as (number | null)[] | null) ?? null,
      timeRangeStart: prefs.timeRangeStart,
      timeRangeEnd: prefs.timeRangeEnd,
      customPromptNotification: prefs.customPromptNotification ?? null,
      meta: (prefs.meta as NotificationPreferenceMeta | null) ?? null,
      createdAt: prefs.createdAt.toISOString(),
      updatedAt: prefs.updatedAt.toISOString(),
    };

    return response;
  }
);
