import { createError, getHeader, setResponseHeader } from 'h3';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { securityEvents, users } from '@/server/infrastructure/db/schema';
import {
  getTimezoneFromRequest,
  getUserTimezone,
  updateUserTimezone,
} from '@/server/application/notifications/timezone.utils';
import { scheduleNotificationSlotsAfterLogin } from '@/server/application/notifications/login-slots.service';
import { getClientIp } from '@/server/utils/ip';
import { checkRateLimit } from '@/server/application/auth/rate-limit';
import { normalizeEmail } from '@/server/application/auth/verification';
import { AuthLoginDto } from '@/shared/dto/auth';
import { toIsoString } from '@/server/utils/serialize';
import { recordUserMarketingAttributionSafe } from '@/server/application/marketing-attribution/marketing-attribution.service';

export default defineEventHandler(async (event) => {
  const body = AuthLoginDto.parse(await readBody(event as any));
  const email = normalizeEmail(body.email);
  const ip = getClientIp(event) || 'unknown';

  const loginLimit = await checkRateLimit(
    `auth:rate_limit:login:ip:${ip}:email:${email}`,
    10,
    15 * 60
  );
  if (!loginLimit.allowed) {
    if (loginLimit.retryAfter) {
      setResponseHeader(event, 'Retry-After', loginLimit.retryAfter);
    }
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверный email или пароль',
    });
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!existing.length || !existing[0].passwordHash) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверный email или пароль',
    });
  }

  // Сначала проверяем пароль (чтобы не раскрывать информацию о блокировке)
  const ok = await argon2.verify(existing[0].passwordHash!, body.password);
  if (!ok) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверный email или пароль',
    });
  }

  if (!existing[0].emailVerifiedAt) {
    await logSecurityEvent(event, 'email_login_unverified', { email });
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверный email или пароль',
    });
  }

  if (existing[0].deletedAt) {
    await db
      .update(users)
      .set({ deletedAt: null, deletionRequestedAt: null })
      .where(eq(users.id, existing[0].id));
  }

  // Проверяем, не заблокирован ли пользователь (после проверки пароля)
  if (existing[0].isBlocked) {
    throw createError({
      statusCode: 401, // Всегда 401 для скрытия факта блокировки
      statusMessage: 'Неверный email или пароль',
    });
  }

  // Получить timezone из запроса (заголовок X-Timezone или body.timezone)
  const timezone = getTimezoneFromRequest(event);

  // Получить текущий timezone пользователя из его preferences
  let currentTimezone: string;
  try {
    currentTimezone = await getUserTimezone(existing[0].id);
  } catch (error) {
    // Если не удалось получить timezone (например, нет preferences), используем fallback
    console.warn(
      `[Auth] Could not get timezone for user ${existing[0].id}, using fallback:`,
      error
    );
    currentTimezone = 'Europe/Moscow';
  }

  // Обновить timezone и пересчитать слоты, если изменился
  // ВАЖНО: Пересчет слотов выполняется асинхронно в фоне, не блокирует авторизацию
  if (timezone !== currentTimezone) {
    console.log(
      `[Auth] Timezone changed for user ${existing[0].id}: ${currentTimezone} → ${timezone}`
    );
    // Не используем await, чтобы не блокировать авторизацию
    // updateUserTimezone сама запустит пересчет слотов асинхронно
    updateUserTimezone(existing[0].id, timezone).catch((error) => {
      console.error(
        `[Auth] Failed to update timezone for user ${existing[0].id}:`,
        error
      );
    });
  } else {
    console.log(
      `[Auth] Timezone unchanged for user ${existing[0].id}: ${timezone}`
    );
  }

  await db
    .update(users)
    .set({
      locale: body.locale ?? existing[0].locale,
      lastLoginAt: new Date(),
      updatedAt: new Date(), // Явно обновляем updatedAt
    })
    .where(eq(users.id, existing[0].id));

  // Ротация session ID при логине (защита от session fixation)
  const { rotateSessionId } = await import('@/server/application/auth/session');
  const sessionId = await rotateSessionId(event, existing[0].id, body.locale);
  // После логина проверяем расписание уведомлений в фоне, чтобы не блокировать ответ
  scheduleNotificationSlotsAfterLogin(existing[0].id);
  await recordUserMarketingAttributionSafe({
    userId: existing[0].id,
    touchpoint: 'email_login',
    authProvider: 'email',
    marketingAttribution: body.marketingAttribution,
  });

  // Определяем, является ли запрос от native платформы (Capacitor)
  const platform = String(getHeader(event, 'x-platform') || '').toLowerCase();
  const isNative = platform === 'ios' || platform === 'android';

  return {
    user: {
      id: existing[0].id,
      email: existing[0].email,
      name: existing[0].name,
      locale: body.locale ?? existing[0].locale,
      role: existing[0].roleId || 'user',
      isBlocked: existing[0].isBlocked || false,
      emailVerifiedAt: toIsoString(existing[0].emailVerifiedAt),
      hasPassword: !!existing[0].passwordHash,
    },
    // Отдаем sessionToken только для native платформ (Capacitor)
    // Для web используем только httpOnly cookie
    ...(isNative ? { sessionToken: sessionId } : {}),
  };
});

async function logSecurityEvent(
  event: any,
  eventType: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const ip = getClientIp(event);
    const userAgent = event.node?.req?.headers['user-agent'] || null;
    await db.insert(securityEvents).values({
      userId: null,
      eventType,
      ipAddress: ip,
      userAgent,
      metadata,
    });
  } catch (error) {
    console.error('[Auth] Failed to log security event:', error);
  }
}
