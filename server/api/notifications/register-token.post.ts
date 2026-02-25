import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { userDevices } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  UserDeviceDto,
  RegisterTokenDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

function normalizeAppEnv(raw?: string | null): 'dev' | 'prod' | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === 'prod' || value === 'production') return 'prod';
  if (value === 'dev' || value === 'development') return 'dev';
  return null;
}

function resolveServerAppEnv(): 'dev' | 'prod' {
  const fromEnv = normalizeAppEnv(
    process.env.MENTALA_DB_ENV || process.env.NODE_ENV
  );
  return fromEnv || 'dev';
}

/**
 * POST /api/notifications/register-token
 * Регистрация/обновление FCM токена устройства
 */
export default defineEventHandler(async (event): Promise<UserDeviceDto> => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = sessionResult.user.id;

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

  const headerAppEnv = normalizeAppEnv(
    String(event.node.req.headers['x-app-env'] || '')
  );
  const bodyAppEnv = normalizeAppEnv(body.appEnv);
  const requestedAppEnv = headerAppEnv || bodyAppEnv;
  const appEnv = resolveServerAppEnv();

  // Канонизируем окружение на сервере, чтобы клиентские dev/prod рассинхроны
  // не уводили токен в "чужой" app_env и не ломали доставку на устройстве.
  if (requestedAppEnv && requestedAppEnv !== appEnv) {
    console.warn('[Notifications] register-token app_env mismatch', {
      userId,
      requestedAppEnv,
      serverAppEnv: appEnv,
      platform: body.platform,
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
        appEnv,
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
      appEnv: updated.appEnv as 'dev' | 'prod',
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
        appEnv,
      })
      .returning();

    return {
      id: created.id,
      userId: created.userId,
      token: created.token,
      platform: created.platform as 'ios' | 'android' | 'web',
      appEnv: created.appEnv as 'dev' | 'prod',
      lastSeen: created.lastSeen?.toISOString() ?? null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }
});
