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
 */
export default defineEventHandler(
  async (event): Promise<NotificationPreferencesDto[]> => {
    const user = await getSessionUser(event);
    if (!user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = user.id;

    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    return prefs.map((p) => ({
      id: p.id,
      userId: p.userId,
      kind: p.kind as 'therapy' | 'habits',
      habitId: p.habitId ?? null,
      topicKey: p.topicKey ?? null,
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
      meta: (p.meta as NotificationPreferenceMeta | null) ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }
);
