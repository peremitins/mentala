import { eq } from 'drizzle-orm';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  NotificationPreferenceMeta,
  NotificationPreferencesDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/notifications/prefs
 * Получить все локальные настройки уведомлений пользователя
 * ВАЖНО: Возвращаем ВСЕ настройки (включая неактивные), так как фронтенд сам фильтрует по enabled
 * для подсчета общего количества активных уведомлений.
 */
export default defineEventHandler(
  async (event): Promise<NotificationPreferencesDto[]> => {
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionResult.user.id;

    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    return prefs.map((p) => ({
      id: p.id,
      userId: p.userId,
      kind: p.kind as 'therapy' | 'habits',
      entityKey: p.entityKey ?? null,
      enabled: p.enabled,
      timesPerDay: p.timesPerDay,
      directness: p.directness as 'soft' | 'moderate' | 'hard',
      timezone: p.timezone,
      subtype: p.subtype as
        | 'reminder'
        | 'informational'
        | 'motivational'
        | null,
      activeDays: (p.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
      customSlotTimes: (p.customSlotTimes as (number | null)[] | null) ?? null,
      timeRangeStart: p.timeRangeStart,
      timeRangeEnd: p.timeRangeEnd,
      customPromptNotification: p.customPromptNotification ?? null,
      meta: (p.meta as NotificationPreferenceMeta | null) ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }
);
