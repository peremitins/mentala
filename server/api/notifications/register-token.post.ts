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

  const now = new Date();

  // Регистрация токена должна быть идемпотентной:
  // один и тот же FCM token может прилететь почти одновременно из push-плагина,
  // auth store и экрана настроек. `select -> insert` здесь гоняется и периодически
  // падает по unique(token), поэтому используем atomic upsert.
  const [device] = await db
    .insert(userDevices)
    .values({
      id: nanoid(),
      userId,
      token: body.token,
      platform: body.platform,
      appEnv,
      lastSeen: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userDevices.token,
      set: {
        userId,
        platform: body.platform,
        appEnv,
        lastSeen: now,
        updatedAt: now,
      },
    })
    .returning();

  return {
    id: device.id,
    userId: device.userId,
    token: device.token,
    platform: device.platform as 'ios' | 'android' | 'web',
    appEnv: device.appEnv as 'dev' | 'prod',
    lastSeen: device.lastSeen?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  };
});
