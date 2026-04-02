import { eq } from 'drizzle-orm';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  NotificationPreferenceMeta,
  NotificationPreferencesDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';
import { ensureAiNotificationAccessConsistency } from '@/server/application/notifications/notification-source-access.service';
import {
  clampNotificationTimesPerDay,
  normalizeCustomSlotTimesByLimit,
} from '@/server/application/notifications/preferences-limits.utils';

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

    await ensureAiNotificationAccessConsistency({
      userId,
      userRole: (sessionResult.user as any)?.roleId ?? null,
    });

    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    return prefs.map((p) => {
      // В ответе всегда держим инвариант max=5, даже если в БД есть legacy-значения.
      const normalizedTimesPerDay = clampNotificationTimesPerDay(p.timesPerDay);

      return {
        id: p.id,
        userId: p.userId,
        kind: p.kind as 'therapy' | 'habits',
        entityKey: p.entityKey ?? null,
        enabled: p.enabled,
        timesPerDay: normalizedTimesPerDay,
        directness: p.directness as 'soft' | 'moderate' | 'hard',
        timezone: p.timezone,
        subtype: p.subtype as
          | 'reminder'
          | 'informational'
          | 'motivational'
          | null,
        activeDays: (p.activeDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
        customSlotTimes: normalizeCustomSlotTimesByLimit(
          (p.customSlotTimes as (number | null)[] | null) ?? null,
          normalizedTimesPerDay
        ),
        timeRangeStart: p.timeRangeStart,
        timeRangeEnd: p.timeRangeEnd,
        customPromptNotification: p.customPromptNotification ?? null,
        meta: (p.meta as NotificationPreferenceMeta | null) ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    });
  }
);
