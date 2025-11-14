import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { userDevices } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  UserDeviceDto,
  RegisterTokenDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * POST /api/notifications/register-token
 * Регистрация/обновление FCM токена устройства
 */
export default defineEventHandler(async (event): Promise<UserDeviceDto> => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = user.id;

  const body = await readBody<RegisterTokenDto>(event);

  // Валидация
  if (!body.token || body.token.trim().length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Token is required',
    });
  }

  if (!body.platform || !['ios', 'android', 'web'].includes(body.platform)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid platform',
    });
  }

  // Проверяем, существует ли этот токен
  const [existing] = await db
    .select()
    .from(userDevices)
    .where(eq(userDevices.token, body.token))
    .limit(1);

  if (existing) {
    // Обновляем lastSeen и userId (на случай если устройство перешло к другому пользователю)
    const [updated] = await db
      .update(userDevices)
      .set({
        userId,
        platform: body.platform,
        lastSeen: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userDevices.token, body.token))
      .returning();

    return {
      id: updated.id,
      userId: updated.userId,
      token: updated.token,
      platform: updated.platform as 'ios' | 'android' | 'web',
      lastSeen: updated.lastSeen?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  } else {
    // Создаём новую запись
    const [created] = await db
      .insert(userDevices)
      .values({
        id: nanoid(),
        userId,
        token: body.token,
        platform: body.platform,
      })
      .returning();

    return {
      id: created.id,
      userId: created.userId,
      token: created.token,
      platform: created.platform as 'ios' | 'android' | 'web',
      lastSeen: created.lastSeen?.toISOString() ?? null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }
});
