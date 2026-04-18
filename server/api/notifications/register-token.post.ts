import { nanoid } from 'nanoid';
import { eq, and, ne } from 'drizzle-orm';
import { userDevices } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  UserDeviceDto,
  RegisterTokenDto,
  PlatformFamily,
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
 * Определяет platformFamily на основе platform и channelType.
 * Для native: ios → ios, android → android
 * Для pwa: платформа определяется из platform-поля (web на мобайле считается по UA)
 */
function resolvePlatformFamily(
  platform: string,
  channelType: string,
  explicitPlatformFamily?: string | null
): PlatformFamily | null {
  if (
    explicitPlatformFamily &&
    ['ios', 'android', 'desktop'].includes(explicitPlatformFamily)
  ) {
    return explicitPlatformFamily as PlatformFamily;
  }

  if (channelType === 'native') {
    if (platform === 'ios') return 'ios';
    if (platform === 'android') return 'android';
  }

  // Для pwa: platform = 'web', платформа уточняется клиентом через explicitPlatformFamily
  // Если не передана — оставляем null, будет видно из user-agent при диагностике
  return null;
}

/**
 * Обновляет isPrimary для устройств пользователя по правилу native > pwa > browser.
 * Вызывается после upsert-регистрации endpoint.
 */
async function updatePrimaryEndpoints(
  userId: number,
  platformFamily: PlatformFamily,
  appEnv: 'dev' | 'prod'
): Promise<void> {
  // Получаем все активные устройства пользователя для данной платформы
  const devices = await db
    .select({
      id: userDevices.id,
      channelType: userDevices.channelType,
      isPrimary: userDevices.isPrimary,
    })
    .from(userDevices)
    .where(
      and(
        eq(userDevices.userId, userId),
        eq(userDevices.platformFamily, platformFamily),
        eq(userDevices.appEnv, appEnv),
        eq(userDevices.isActive, true)
      )
    );

  if (devices.length === 0) return;

  // Определяем primary по канальному приоритету.
  const priorityMap: Record<string, number> = {
    native: 3,
    pwa: 2,
    browser: 1,
  };
  const topPriority = devices.reduce((maxPriority, device) => {
    return Math.max(maxPriority, priorityMap[device.channelType] ?? 0);
  }, 0);

  for (const device of devices) {
    const shouldBePrimary =
      (priorityMap[device.channelType] ?? 0) === topPriority;

    if (device.isPrimary !== shouldBePrimary) {
      await db
        .update(userDevices)
        .set({ isPrimary: shouldBePrimary, updatedAt: new Date() })
        .where(eq(userDevices.id, device.id));
    }
  }
}

/**
 * POST /api/notifications/register-token
 * Регистрация/обновление FCM токена устройства.
 * Поддерживает нативные токены (Capacitor) и web push токены (PWA/browser).
 * Обратно совместим: старые клиенты могут не передавать channelType/platformFamily.
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

  // Валидация токена
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

  const channelType =
    body.channelType && ['native', 'pwa', 'browser'].includes(body.channelType)
      ? body.channelType
      : 'native';

  const platformFamily = resolvePlatformFamily(
    body.platform,
    channelType,
    body.platformFamily
  );

  const installationId = body.installationId?.trim() || null;

  const headerAppEnv = normalizeAppEnv(
    String(event.node.req.headers['x-app-env'] || '')
  );
  const bodyAppEnv = normalizeAppEnv(body.appEnv);
  const requestedAppEnv = headerAppEnv || bodyAppEnv;
  const appEnv = resolveServerAppEnv();

  if (requestedAppEnv && requestedAppEnv !== appEnv) {
    console.warn('[Notifications] register-token app_env mismatch', {
      userId,
      requestedAppEnv,
      serverAppEnv: appEnv,
      platform: body.platform,
      channelType,
    });
  }

  const now = new Date();

  // Атомарный upsert — идемпотентен при повторных вызовах
  const [device] = await db
    .insert(userDevices)
    .values({
      id: nanoid(),
      userId,
      token: body.token,
      platform: body.platform,
      appEnv,
      channelType,
      platformFamily: platformFamily ?? undefined,
      installationId: installationId ?? undefined,
      isActive: true,
      isPrimary: false,
      lastSeen: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userDevices.token,
      set: {
        userId,
        platform: body.platform,
        appEnv,
        channelType,
        ...(platformFamily !== null ? { platformFamily } : {}),
        ...(installationId !== null ? { installationId } : {}),
        isActive: true,
        lastSeen: now,
        updatedAt: now,
      },
    })
    .returning();

  console.log('[Notifications] register-token', {
    userId,
    platform: device.platform,
    channelType: device.channelType,
    platformFamily: device.platformFamily,
    installationId: device.installationId ? '***' : null,
    appEnv: device.appEnv,
  });

  // Деактивируем старые токены того же типа (user + platformFamily + channelType + appEnv).
  // При переустановке приложения/PWA FCM выдаёт новый токен — старый становится
  // дублём и приводит к нескольким уведомлениям на одно устройство.
  // Исключаем только что зарегистрированный токен через ne(token).
  if (device.platformFamily) {
    const deactivated = await db
      .update(userDevices)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(userDevices.userId, userId),
          eq(userDevices.platformFamily, device.platformFamily),
          eq(userDevices.channelType, device.channelType),
          eq(userDevices.appEnv, appEnv),
          ne(userDevices.token, device.token)
        )
      )
      .returning({ id: userDevices.id });

    if (deactivated.length > 0) {
      console.log('[Notifications] Deactivated old tokens', {
        userId,
        platformFamily: device.platformFamily,
        channelType: device.channelType,
        count: deactivated.length,
      });
    }
  }

  // Пересчитываем isPrimary для mobile-платформ (native > pwa)
  const resolvedFamily = device.platformFamily as PlatformFamily | null;
  if (resolvedFamily && ['ios', 'android'].includes(resolvedFamily)) {
    await updatePrimaryEndpoints(userId, resolvedFamily, appEnv);
  }

  return {
    id: device.id,
    userId: device.userId,
    token: device.token,
    platform: device.platform as 'ios' | 'android' | 'web',
    appEnv: device.appEnv as 'dev' | 'prod',
    channelType: (device.channelType ?? 'native') as
      | 'native'
      | 'pwa'
      | 'browser',
    platformFamily: (device.platformFamily ?? null) as
      | 'ios'
      | 'android'
      | 'desktop'
      | null,
    installationId: device.installationId ?? null,
    isActive: device.isActive ?? true,
    isPrimary: device.isPrimary ?? false,
    lastSeen: device.lastSeen?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  };
});
