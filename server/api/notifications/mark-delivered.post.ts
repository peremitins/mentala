/**
 * Пометить уведомление как доставленное (для dev-режима)
 */

import { getSessionUser } from '@/server/application/auth/session';
import { db } from '@/server/infrastructure/db/client';
import { notificationSlots } from '@/server/infrastructure/db/schema';
import { and, eq, inArray, or } from 'drizzle-orm';
import { setResponseStatus } from 'h3';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }

  const body = await readBody<{ slotId?: string; slotIds?: string[] }>(event);
  const requestedSlotIds = Array.from(
    new Set(
      [
        typeof body?.slotId === 'string' ? body.slotId.trim() : '',
        ...(Array.isArray(body?.slotIds) ? body.slotIds : []).map((id) =>
          typeof id === 'string' ? id.trim() : ''
        ),
      ].filter((id) => id.length > 0)
    )
  );

  if (requestedSlotIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Missing slotId or slotIds',
    });
  }

  const anchors = await db
    .select({
      id: notificationSlots.id,
      scheduledAt: notificationSlots.scheduledAt,
    })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, sessionResult.user.id),
        inArray(notificationSlots.id, requestedSlotIds)
      )
    );

  if (anchors.length === 0) {
    // Не считаем ошибкой: уведомления могли быть удалены/обработаны в другом потоке.
    setResponseStatus(event, 204);
    return {
      success: true,
      matchedSlots: 0,
      updatedCount: 0,
    };
  }

  const anchorIds = anchors.map((slot) => slot.id);
  const anchorTimes = Array.from(
    new Set(
      anchors
        .map((slot) => {
          const scheduledAt =
            slot.scheduledAt instanceof Date
              ? slot.scheduledAt
              : new Date(slot.scheduledAt);
          return Number.isNaN(scheduledAt.getTime())
            ? null
            : scheduledAt.toISOString();
        })
        .filter((iso): iso is string => Boolean(iso))
    )
  ).map((iso) => new Date(iso));

  const updateConditions = [
    and(
      eq(notificationSlots.userId, sessionResult.user.id),
      inArray(notificationSlots.id, anchorIds)
    ),
  ];

  if (anchorTimes.length > 0) {
    updateConditions.push(
      and(
        eq(notificationSlots.userId, sessionResult.user.id),
        eq(notificationSlots.status, 'sent'),
        inArray(notificationSlots.scheduledAt, anchorTimes)
      )
    );
  }

  // Помечаем:
  // 1) явно переданные слоты;
  // 2) остальные sent-слоты в этой же временной пачке (тот же scheduledAt).
  // Это убирает баг, когда "скипается только первый" в группе уведомлений.
  const updateResult = await db
    .update(notificationSlots)
    .set({ status: 'skipped' })
    .where(
      updateConditions.length === 1
        ? updateConditions[0]
        : or(...updateConditions)
    );

  const updatedCount = updateResult.rowCount ?? 0;

  console.log(
    `[MarkDelivered] User ${sessionResult.user.id}: requested=${requestedSlotIds.length}, matched=${anchors.length}, skipped=${updatedCount}`
  );

  return {
    success: true,
    matchedSlots: anchors.length,
    updatedCount,
    scheduledAt: anchorTimes.map((time) => time.toISOString()),
  };
});
