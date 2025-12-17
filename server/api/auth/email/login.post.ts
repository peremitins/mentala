import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import { createSession } from '@/server/application/auth/session';
import argon2 from 'argon2';
import {
  getTimezoneFromRequest,
  getUserTimezone,
  updateUserTimezone,
} from '@/server/application/notifications/timezone.utils';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
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
  if (!existing.length || !existing[0].passwordHash) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid credentials',
    });
  }
  const ok = await argon2.verify(existing[0].passwordHash!, body.password);
  if (!ok)
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid credentials',
    });

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
  const sessionId = await createSession(event, existing[0].id, body.locale);
  return {
    user: {
      id: existing[0].id,
      email: existing[0].email,
      name: existing[0].name,
      locale: body.locale ?? existing[0].locale,
    },
    sessionToken: sessionId, // Для использования в заголовке X-Session-Token если cookie не передается
  };
});
