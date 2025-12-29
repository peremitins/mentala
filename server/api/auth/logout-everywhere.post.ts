import { defineEventHandler, createError, getCookie, getHeader } from 'h3';
import { getSessionUser, revokeAllUserSessions, revokeSession } from '@/server/application/auth/session';
import { getCookieName } from '@/server/application/auth/cookie-names';

const isProd = process.env.NODE_ENV === 'production';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Не авторизован',
    });
  }

  const userId = sessionResult.user.id;
  
  // Получаем текущий session ID
  const sessionCookieName = getCookieName('mentala.sid', isProd);
  const currentSessionId = sessionResult.channel === 'cookie' 
    ? getCookie(event, sessionCookieName)
    : getHeader(event, 'x-session-token');

  // Ревокация всех сессий, кроме текущей
  await revokeAllUserSessions(userId, currentSessionId || undefined);

  // Ревокация текущей сессии
  await revokeSession(event);

  return { ok: true };
});
