import { eq, and, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  HabitSubtype,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';
import { regenerateSlotsForSource } from '@/server/application/notifications/scheduler.service';
import type { NotificationKind } from '@/app/lib/notificationTemplates';

function normalizeCustomSlotTimes(
  input: (number | null)[] | null | undefined,
  limit: number
): (number | null)[] | null {
  if (!input || limit <= 0) {
    return null;
  }

  const normalized = input
    .slice(0, limit)
    .map((value) =>
      value === null || value === undefined ? null : Math.round(value)
    );

  // Удаляем хвостовые null, чтобы не хранить лишние значения
  while (normalized.length && normalized[normalized.length - 1] === null) {
    normalized.pop();
  }

  return normalized.length ? normalized : null;
}

/**
 * PUT /api/notifications/prefs/:kind
 * Обновить локальные настройки конкретного типа (therapy | habits)
 */
const HABIT_SUBTYPES: HabitSubtype[] = [
  'reminder',
  'informational',
  'motivational',
  'mixed',
];

export default defineEventHandler(
  async (event): Promise<NotificationPreferencesDto> => {
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

    const body = await readBody<UpdateNotificationPreferencesDto>(event);

    // Валидация
    if (body.timesPerDay !== undefined) {
      if (body.timesPerDay < 1 || body.timesPerDay > 8) {
        throw createError({
          statusCode: 400,
          message: 'timesPerDay must be between 1 and 8',
        });
      }
    }

    if (
      body.directness &&
      !['soft', 'moderate', 'hard'].includes(body.directness)
    ) {
      throw createError({
        statusCode: 400,
        message: 'Invalid directness value',
      });
    }

    if (body.subtype !== undefined) {
      if (kind !== 'habits' && body.subtype !== null) {
        throw createError({
          statusCode: 400,
          message: 'subtype is only supported for habits',
        });
      }

      if (
        body.subtype !== null &&
        !HABIT_SUBTYPES.includes(body.subtype as HabitSubtype)
      ) {
        throw createError({
          statusCode: 400,
          message: 'Invalid subtype value',
        });
      }
    }

    // Валидация activeDays
    if (body.activeDays !== undefined) {
      if (
        !Array.isArray(body.activeDays) ||
        body.activeDays.length < 1 ||
        body.activeDays.length > 7
      ) {
        throw createError({
          statusCode: 400,
          message: 'activeDays must be an array with 1-7 unique days',
        });
      }
      // Проверяем что все значения от 0 до 6
      const validDays = body.activeDays.every((day) => day >= 0 && day <= 6);
      if (!validDays) {
        throw createError({
          statusCode: 400,
          message: 'activeDays must contain only values from 0 to 6',
        });
      }
      // Проверяем что нет дубликатов
      const uniqueDays = new Set(body.activeDays);
      if (uniqueDays.size !== body.activeDays.length) {
        throw createError({
          statusCode: 400,
          message: 'activeDays must not contain duplicates',
        });
      }
    }

    // Валидация timeRangeStart и timeRangeEnd
    if (body.timeRangeStart !== undefined) {
      if (body.timeRangeStart < 0 || body.timeRangeStart > 1439) {
        throw createError({
          statusCode: 400,
          message: 'timeRangeStart must be between 0 and 1439 minutes',
        });
      }
    }
    if (body.timeRangeEnd !== undefined) {
      if (body.timeRangeEnd < 0 || body.timeRangeEnd > 1439) {
        throw createError({
          statusCode: 400,
          message: 'timeRangeEnd must be between 0 and 1439 minutes',
        });
      }
    }
    // Проверяем минимальную ширину окна (60 минут)
    if (body.timeRangeStart !== undefined && body.timeRangeEnd !== undefined) {
      const start = body.timeRangeStart;
      const end = body.timeRangeEnd;
      let duration: number;

      if (start <= end) {
        // Обычный диапазон внутри суток
        duration = end - start;
      } else {
        // Диапазон через полночь
        duration = 1440 - start + end;
      }

      if (duration < 60) {
        throw createError({
          statusCode: 400,
          message: 'Time range must be at least 60 minutes',
        });
      }
    }

    // Валидация customSlotTimes
    if (body.customSlotTimes !== undefined) {
      if (
        body.customSlotTimes !== null &&
        !Array.isArray(body.customSlotTimes)
      ) {
        throw createError({
          statusCode: 400,
          message: 'customSlotTimes must be an array or null',
        });
      }

      if (Array.isArray(body.customSlotTimes)) {
        if (body.customSlotTimes.length > 8) {
          throw createError({
            statusCode: 400,
            message: 'customSlotTimes length must not exceed 8 entries',
          });
        }

        const isValid = body.customSlotTimes.every(
          (value) =>
            value === null ||
            (typeof value === 'number' &&
              Number.isFinite(value) &&
              value >= 0 &&
              value <= 1439)
        );

        if (!isValid) {
          throw createError({
            statusCode: 400,
            message:
              'customSlotTimes values must be null or numbers between 0 and 1439',
          });
        }
      }
    }

    const habitId = body.habitId;
    const topicKey = body.topicKey;

    // Пытаемся найти существующие настройки с учётом habitId/topicKey
    // Строим WHERE условие правильно, объединяя все условия через and()
    const conditions = [
      eq(notificationPreferences.userId, userId),
      eq(notificationPreferences.kind, kind),
    ];

    if (kind === 'habits' && habitId) {
      conditions.push(eq(notificationPreferences.habitId, habitId));
    } else if (kind === 'therapy' && topicKey) {
      conditions.push(eq(notificationPreferences.topicKey, topicKey));
    } else {
      // Общие настройки (без habitId/topicKey)
      conditions.push(isNull(notificationPreferences.habitId));
      conditions.push(isNull(notificationPreferences.topicKey));
    }

    const [existing] = await db
      .select()
      .from(notificationPreferences)
      .where(and(...conditions))
      .limit(1);

    if (existing) {
      const nextTimesPerDay = body.timesPerDay ?? existing.timesPerDay;
      const customSlotTimesInput =
        body.customSlotTimes !== undefined
          ? body.customSlotTimes
          : ((existing.customSlotTimes as (number | null)[] | null) ?? null);
      const nextCustomSlotTimes = normalizeCustomSlotTimes(
        customSlotTimesInput,
        nextTimesPerDay
      );
      const nextSubtype =
        kind === 'habits'
          ? body.subtype !== undefined
            ? body.subtype
            : (existing.subtype as HabitSubtype | null)
          : null;

      // Обновляем существующие
      const [updated] = await db
        .update(notificationPreferences)
        .set({
          enabled: body.enabled ?? existing.enabled,
          timesPerDay: body.timesPerDay ?? existing.timesPerDay,
          directness: body.directness ?? existing.directness,
          timezone: body.timezone ?? existing.timezone,
          subtype: nextSubtype,
          activeDays: body.activeDays ?? existing.activeDays,
          timeRangeStart: body.timeRangeStart ?? existing.timeRangeStart,
          timeRangeEnd: body.timeRangeEnd ?? existing.timeRangeEnd,
          customSlotTimes: nextCustomSlotTimes,
          meta: body.meta !== undefined ? body.meta : existing.meta,
          updatedAt: new Date(),
        })
        .where(eq(notificationPreferences.id, existing.id))
        .returning();

      // Регенерируем слоты только для этого источника
      try {
        await regenerateSlotsForSource(userId, kind as 'therapy' | 'habits', {
          habitId,
          topicKey,
        });
        console.log(
          `[NotificationPrefs] Slots regenerated for source: user ${userId}, kind: ${kind}`,
          habitId ? `, habitId: ${habitId}` : '',
          topicKey ? `, topicKey: ${topicKey}` : ''
        );
      } catch (error) {
        console.error(`[NotificationPrefs] Failed to regenerate slots:`, error);
      }

      const response = {
        id: updated.id,
        userId: updated.userId,
        kind: updated.kind as 'therapy' | 'habits',
        habitId: updated.habitId ?? null,
        topicKey: updated.topicKey ?? null,
        enabled: updated.enabled,
        timesPerDay: updated.timesPerDay,
        directness: updated.directness as 'soft' | 'moderate' | 'hard',
        timezone: updated.timezone,
        subtype: updated.subtype as HabitSubtype | null,
        activeDays: (updated.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
        customSlotTimes:
          (updated.customSlotTimes as (number | null)[] | null) ?? null,
        timeRangeStart: updated.timeRangeStart,
        timeRangeEnd: updated.timeRangeEnd,
        meta: updated.meta as Record<string, any> | null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };

      return response;
    } else {
      // Создаём новые (дефолтные значения)
      const timezone = body.timezone ?? 'Europe/Moscow';
      const initialTimesPerDay = body.timesPerDay ?? 3;
      const initialCustomSlotTimes = normalizeCustomSlotTimes(
        body.customSlotTimes ?? null,
        initialTimesPerDay
      );
      const initialSubtype =
        kind === 'habits' ? (body.subtype ?? 'mixed') : null;
      const [created] = await db
        .insert(notificationPreferences)
        .values({
          id: nanoid(),
          userId,
          kind,
          habitId: habitId ?? null,
          topicKey: topicKey ?? null,
          enabled: body.enabled ?? true,
          timesPerDay: initialTimesPerDay,
          directness: body.directness ?? 'moderate',
          timezone,
          subtype: initialSubtype,
          activeDays: body.activeDays ?? [0, 1, 2, 3, 4, 5, 6],
          timeRangeStart: body.timeRangeStart ?? 540, // 09:00
          timeRangeEnd: body.timeRangeEnd ?? 1350, // 22:30
          customSlotTimes: initialCustomSlotTimes,
          meta: body.meta ?? null,
        })
        .returning();

      // Генерируем слоты для нового источника
      try {
        await regenerateSlotsForSource(userId, kind as 'therapy' | 'habits', {
          habitId,
          topicKey,
        });
        console.log(
          `[NotificationPrefs] Slots generated for new source: user ${userId}, kind: ${kind}`,
          habitId ? `, habitId: ${habitId}` : '',
          topicKey ? `, topicKey: ${topicKey}` : ''
        );
      } catch (error) {
        console.error(`[NotificationPrefs] Failed to generate slots:`, error);
      }

      const response = {
        id: created.id,
        userId: created.userId,
        kind: created.kind as 'therapy' | 'habits',
        habitId: created.habitId ?? null,
        topicKey: created.topicKey ?? null,
        enabled: created.enabled,
        timesPerDay: created.timesPerDay,
        directness: created.directness as 'soft' | 'moderate' | 'hard',
        timezone: created.timezone,
        subtype: created.subtype as HabitSubtype | null,
        activeDays: (created.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
        customSlotTimes:
          (created.customSlotTimes as (number | null)[] | null) ?? null,
        timeRangeStart: created.timeRangeStart,
        timeRangeEnd: created.timeRangeEnd,
        meta: created.meta as Record<string, any> | null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };

      return response;
    }
  }
);
