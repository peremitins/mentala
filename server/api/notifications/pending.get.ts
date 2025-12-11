/**
 * Получить pending уведомления для текущего пользователя
 * (для тестирования без Firebase - клиент опрашивает этот endpoint
 * и показывает LocalNotifications)
 */

import { getSessionUser } from '@/server/application/auth/session';
import { db } from '@/server/infrastructure/db/client';
import { notificationSlots } from '@/server/infrastructure/db/schema';
import { and, eq, lte } from 'drizzle-orm';
import {
  getUserTimezone,
  toLocalTime,
} from '@/server/application/notifications/timezone.utils';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }

  // Получаем все слоты со статусом 'sent' (worker отправил, но FCM в dev-режиме - заглушка)
  // Клиент сам покажет их через LocalNotifications
  const pending = await db
    .select()
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, user.id),
        eq(notificationSlots.status, 'sent')
      )
    )
    .orderBy(notificationSlots.scheduledAt)
    .limit(20);

  console.log(
    `[PendingNotifications] Found ${pending.length} sent slots for user ${user.id}`
  );

  // Получаем timezone пользователя для преобразования времени
  const timezone = await getUserTimezone(user.id);

  // Преобразуем scheduledAt из UTC в локальное время пользователя
  const pendingWithLocalTime = pending.map((slot) => {
    const scheduledAtUTC =
      slot.scheduledAt instanceof Date
        ? slot.scheduledAt
        : new Date(slot.scheduledAt);
    const scheduledAtLocal = toLocalTime(scheduledAtUTC, timezone);

    return {
      ...slot,
      scheduledAt: scheduledAtUTC.toISOString(), // Оставляем UTC для совместимости
      scheduledAtLocal: scheduledAtLocal.toISOString(), // Добавляем локальное время
    };
  });

  return pendingWithLocalTime;
});
