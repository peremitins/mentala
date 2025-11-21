import { eq, and, gt, isNull } from 'drizzle-orm';
import { notificationSlots } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { SnoozeRequestDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * POST /api/notifications/snooze
 * Отложить ближайшее уведомление
 */
export default defineEventHandler(
  async (event): Promise<{ success: boolean; snoozedUntil: string }> => {
    const user = await getSessionUser(event);
    if (!user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = user.id;

    const body = await readBody<SnoozeRequestDto>(event);

    // Валидация
    if (!body.kind || !['therapy', 'habits'].includes(body.kind)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid kind',
      });
    }

    if (
      !body.duration ||
      !['15m', '1h', '4h', 'tomorrow'].includes(body.duration)
    ) {
      throw createError({
        statusCode: 400,
        message: 'Invalid duration',
      });
    }

    // Вычисляем новое время
    const now = new Date();
    let snoozedUntil: Date;

    switch (body.duration) {
      case '15m':
        snoozedUntil = new Date(now.getTime() + 15 * 60 * 1000);
        break;
      case '1h':
        snoozedUntil = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case '4h':
        snoozedUntil = new Date(now.getTime() + 4 * 60 * 60 * 1000);
        break;
      case 'tomorrow':
        snoozedUntil = new Date(now);
        snoozedUntil.setDate(snoozedUntil.getDate() + 1);
        snoozedUntil.setHours(9, 0, 0, 0); // 09:00 завтра
        break;
      default:
        throw createError({
          statusCode: 400,
          message: 'Invalid duration',
        });
    }

    // Находим ближайший слот
    const conditions = [
      eq(notificationSlots.userId, userId),
      eq(notificationSlots.kind, body.kind),
      eq(notificationSlots.status, 'planned'),
      gt(notificationSlots.scheduledAt, now),
    ];

    // Если указан entityKey, фильтруем по нему
    if (body.entityKey) {
      conditions.push(eq(notificationSlots.entityKey, body.entityKey));
    } else {
      conditions.push(isNull(notificationSlots.entityKey));
    }

    const [nearestSlot] = await db
      .select()
      .from(notificationSlots)
      .where(and(...conditions))
      .orderBy(notificationSlots.scheduledAt)
      .limit(1);

    if (!nearestSlot) {
      throw createError({
        statusCode: 404,
        message: 'No planned notifications found',
      });
    }

    // Обновляем слот
    await db
      .update(notificationSlots)
      .set({
        scheduledAt: snoozedUntil,
        snoozedUntil,
      })
      .where(eq(notificationSlots.id, nearestSlot.id));

    return {
      success: true,
      snoozedUntil: snoozedUntil.toISOString(),
    };
  }
);
