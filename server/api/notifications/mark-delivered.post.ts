/**
 * Пометить уведомление как доставленное (для dev-режима)
 */

import { getSessionUser } from '@/server/application/auth/session';
import { db } from '@/server/infrastructure/db/client';
import { notificationSlots } from '@/server/infrastructure/db/schema';
import { and, eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }

  const body = await readBody<{ slotId: string }>(event);
  if (!body?.slotId) {
    throw createError({
      statusCode: 400,
      message: 'Missing slotId',
    });
  }

  // Помечаем как skipped чтобы не показывать повторно
  await db
    .update(notificationSlots)
    .set({ status: 'skipped' })
    .where(
      and(
        eq(notificationSlots.id, body.slotId),
        eq(notificationSlots.userId, user.id)
      )
    );

  console.log(`[MarkDelivered] Slot ${body.slotId} marked as delivered`);

  return { success: true };
});
