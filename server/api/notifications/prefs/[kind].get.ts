import { eq, and, isNull } from 'drizzle-orm';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { NotificationPreferencesDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/notifications/prefs/:kind?habitId=:id или ?topicKey=:key
 * Получить локальные настройки конкретного типа (therapy | habits)
 * Для habits: передаём habitId в query
 * Для therapy: передаём topicKey в query (опционально)
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
    const habitId = query.habitId as string | undefined;
    const topicKey = query.topicKey as string | undefined;

    // Строим WHERE условие с учётом habitId/topicKey
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

    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(and(...conditions))
      .limit(1);

    if (!prefs) {
      return null;
    }

    const response = {
      id: prefs.id,
      userId: prefs.userId,
      kind: prefs.kind as 'therapy' | 'habits',
      habitId: prefs.habitId ?? null,
      topicKey: prefs.topicKey ?? null,
      enabled: prefs.enabled,
      timesPerDay: prefs.timesPerDay,
      directness: prefs.directness as 'soft' | 'moderate' | 'hard',
      timezone: prefs.timezone,
      subtype: prefs.subtype as
        | 'reminder'
        | 'informational'
        | 'motivational'
        | null,
      activeDays: (prefs.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
      customSlotTimes:
        (prefs.customSlotTimes as (number | null)[] | null) ?? null,
      timeRangeStart: prefs.timeRangeStart,
      timeRangeEnd: prefs.timeRangeEnd,
      meta: prefs.meta as Record<string, any> | null,
      createdAt: prefs.createdAt.toISOString(),
      updatedAt: prefs.updatedAt.toISOString(),
    };

    return response;
  }
);
