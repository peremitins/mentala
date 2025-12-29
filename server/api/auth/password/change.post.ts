import { createError, getCookie, getHeader } from 'h3';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import {
  getSessionUser,
  revokeAllUserSessions,
} from '@/server/application/auth/session';
import { PasswordChangeDto } from '@/shared/dto/auth';
import {
  SESSION_COOKIE_NAME,
  getCookieName,
} from '@/server/application/auth/cookie-names';

const isProd = process.env.NODE_ENV === 'production';

export default defineEventHandler(async (event) => {
  const session = await getSessionUser(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Не авторизован' });
  }

  const body = PasswordChangeDto.parse(await readBody(event as any));
  if (body.newPassword !== body.confirmPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Пароли не совпадают',
    });
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!existing.length || !existing[0].passwordHash) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Неверные учетные данные',
    });
  }

  const ok = await argon2.verify(existing[0].passwordHash, body.currentPassword);
  if (!ok) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверные учетные данные',
    });
  }

  const newHash = await argon2.hash(body.newPassword, {
    type: argon2.argon2id,
  });
  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  const cookieName = getCookieName(SESSION_COOKIE_NAME, isProd);
  const cookieSid = getCookie(event, cookieName) || null;
  const headerSidRaw = getHeader(event, 'x-session-token');
  const headerSid =
    headerSidRaw && headerSidRaw.trim() ? headerSidRaw.trim() : null;
  const currentSessionId = headerSid || cookieSid || undefined;

  await revokeAllUserSessions(session.user.id, currentSessionId);

  return { success: true };
});
