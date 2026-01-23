import { and, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { userDevices } from '@/server/infrastructure/db/schema';
import { getSessionUser } from '@/server/application/auth/session';
import type { UnregisterTokenDto } from '@/shared/dto/notifications';

/**
 * POST /api/notifications/unregister-token
 * Отключение push-уведомлений на конкретном устройстве (по токену)
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }

  const body = await readBody<UnregisterTokenDto>(event);
  const token = body?.token?.trim();

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Token is required',
    });
  }

  // Удаляем токен только для текущего пользователя, чтобы не трогать другие аккаунты
  const result = await db
    .delete(userDevices)
    .where(
      and(
        eq(userDevices.userId, sessionResult.user.id),
        eq(userDevices.token, token)
      )
    );

  return { ok: true, removed: (result.rowCount || 0) > 0 };
});
