import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import { createSession } from '@/server/application/auth/session';
import argon2 from 'argon2';
import { getTimezoneFromRequest } from '@/server/application/notifications/timezone.utils';

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
    })
    .returning();

  // При регистрации timezone сохраняется при создании первой preference
  // (при создании первой habit или therapy topic)
  // Здесь мы просто логируем, что timezone будет использован при создании preferences
  console.log(
    `[Auth] User ${u.id} registered with timezone: ${timezone} (will be used when creating first preference)`
  );

  const sessionId = await createSession(event, u.id, body.locale);
  return {
    user: { id: u.id, name: u.name, email: u.email, locale: u.locale },
    sessionToken: sessionId, // Для использования в заголовке X-Session-Token если cookie не передается
  };
});
