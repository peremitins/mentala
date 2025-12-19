import { createError, getHeader } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import { rotateSessionId } from '@/server/application/auth/session';
import argon2 from 'argon2';
import { getTimezoneFromRequest } from '@/server/application/notifications/timezone.utils';
import { activateTrialForUser } from '@/server/application/subscriptions/trial.service';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    name?: string;
    email: string;
    password: string;
    locale?: string;
    timezone?: string; // Опционально, но приоритет у заголовка X-Timezone
  }>(event as any);
  if (!body?.email || !body?.password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing email or password',
    });
  }
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);
  if (existing.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Email already registered',
    });
  }

  // Получить timezone из запроса (заголовок X-Timezone или body.timezone)
  const timezone = getTimezoneFromRequest(event);

  const hash = await argon2.hash(body.password, { type: argon2.argon2id });
  const [u] = await db
    .insert(users)
    .values({
      name: body.name ?? null,
      email: body.email,
      passwordHash: hash,
      locale: body.locale ?? null,
      timezone: timezone || 'Europe/Moscow', // Сохраняем timezone при регистрации
    })
    .returning();

  // Активируем Trial для нового пользователя (или создаем Basic без Trial)
  // ВАЖНО: Всегда создаем подписку Basic при регистрации
  try {
    const subscription = await activateTrialForUser(u.id, timezone);
    if (subscription) {
      console.log(
        `[Auth] ✅ Subscription created for user ${u.id}: planId=${subscription.planId}, paymentStatus=${subscription.paymentStatus}`
      );
    } else {
      console.warn(
        `[Auth] ⚠️ activateTrialForUser returned null for user ${u.id}`
      );
    }
  } catch (error: any) {
    console.error(
      `[Auth] ❌ Failed to activate trial/subscription for user ${u.id}:`,
      error
    );
    console.error(`[Auth] Error details:`, error?.message, error?.stack);
    // Не блокируем регистрацию, если подписка не активировалась, но логируем ошибку
  }

  // Ротация session ID при регистрации (защита от session fixation)
  const sessionId = await rotateSessionId(event, u.id, body.locale);
  
  // Определяем, является ли запрос от native платформы (Capacitor)
  const platform = String(getHeader(event, 'x-platform') || '').toLowerCase();
  const isNative = platform === 'ios' || platform === 'android';
  
  return {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      locale: u.locale,
      role: u.roleId || 'user',
      isBlocked: u.isBlocked || false,
    },
    // Отдаем sessionToken только для native платформ (Capacitor)
    // Для web используем только httpOnly cookie
    ...(isNative ? { sessionToken: sessionId } : {}),
  };
});
