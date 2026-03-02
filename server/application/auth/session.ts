import { randomUUID } from 'node:crypto';
import { setCookie, getCookie, deleteCookie, getHeader } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import {
  sessions,
  users,
  securityEvents,
} from '@/server/infrastructure/db/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  LANG_COOKIE_NAME,
  getCookieName,
} from './cookie-names';
import {
  generateCSRFToken,
  type SessionCookieSameSite,
  setCSRFCookie,
  getCSRFToken as getCSRFTokenFromCookie,
} from './csrf';
import { getClientIp } from '@/server/utils/ip';

const isProd = process.env.NODE_ENV === 'production';
const SESSION_MAX_AGE_DAYS = 7;
const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
const SESSION_ABSOLUTE_MAX_AGE_DAYS = 60; // абсолютный максимум жизни сессии
const SESSION_EXTEND_THRESHOLD_DAYS = 1; // продлевать если истекает в течение 1 дня
const SESSION_EXTEND_COOLDOWN_HOURS = 12; // не продлевать чаще 1 раза в 12 часов

export type AuthChannel = 'cookie' | 'header' | null;

/**
 * Создает новую сессию для пользователя
 */
export async function createSession(
  event: any,
  userId: number,
  locale?: string,
  options?: {
    sameSite?: SessionCookieSameSite;
    secure?: boolean;
  }
): Promise<string> {
  const id = randomUUID();
  const ua = event.node?.req?.headers['user-agent'] || null;
  const ip = getClientIp(event);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  await db.insert(sessions).values({
    id,
    userId,
    userAgent: ua,
    ip,
    createdAt: now,
    expiresAt: expires,
    lastExtendedAt: null,
  });

  const sessionCookieName = getCookieName(SESSION_COOKIE_NAME, isProd);
  const sameSitePolicy: SessionCookieSameSite =
    options?.sameSite || (isProd ? 'strict' : 'lax');
  const secureCookie =
    typeof options?.secure === 'boolean' ? options.secure : isProd;

  setCookie(event, sessionCookieName, id, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: sameSitePolicy,
    path: '/', // обязательно для __Host- префикса
    ...(isProd ? {} : { domain: undefined }), // для __Host- префикса не указывать domain
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  // Генерируем и устанавливаем CSRF токен
  const csrfToken = generateCSRFToken();
  setCSRFCookie(event, csrfToken, expires, {
    sameSite: sameSitePolicy,
    secure: secureCookie,
  });

  if (locale) {
    const langCookieName = getCookieName(LANG_COOKIE_NAME, isProd);
    setCookie(event, langCookieName, locale, {
      httpOnly: false,
      secure: secureCookie,
      sameSite: sameSitePolicy,
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });
  }

  return id;
}

/**
 * Получает пользователя из сессии и определяет канал аутентификации
 * Возвращает { user, channel } где channel = 'cookie' | 'header' | null
 */
export async function getSessionUser(
  event: any
): Promise<{ user: any; channel: AuthChannel } | null> {
  const sessionCookieName = getCookieName(SESSION_COOKIE_NAME, isProd);
  let sid: string | null = null;
  let channel: AuthChannel = null;
  let cookieSid: string | null = null;
  let headerSid: string | null = null;

  // Проверяем cookie (для Web)
  cookieSid = getCookie(event, sessionCookieName) || null;

  // Проверяем заголовок X-Session-Token (для Capacitor)
  const tokenHeader = getHeader(event, 'x-session-token');
  if (tokenHeader) {
    headerSid = tokenHeader.trim();
  }

  // Определяем канал: если есть X-Session-Token header, это Capacitor запрос
  // Для Capacitor всегда используем header-канал, чтобы не требовать CSRF
  if (headerSid) {
    // Header присутствует - это Capacitor запрос
    sid = headerSid;
    channel = 'header';

    // Если есть и cookie, и header, но они разные - логируем подозрительное событие
    if (cookieSid && cookieSid !== headerSid) {
      try {
        const userAgent = getHeader(event, 'user-agent') || null;
        const ip = getClientIp(event);
        await db.insert(securityEvents).values({
          userId: null, // пока не знаем user
          eventType: 'auth_dual_channel_mismatch',
          ipAddress: ip,
          userAgent: userAgent,
          metadata: {
            cookieSid: cookieSid.substring(0, 8) + '...', // частично для безопасности
            headerSid: headerSid.substring(0, 8) + '...',
          },
        });
      } catch (error) {
        console.error('[Session] Failed to log dual-channel mismatch:', error);
      }
    }
  } else if (cookieSid) {
    // Только cookie - это web запрос
    sid = cookieSid;
    channel = 'cookie';
  }

  // Логирование использования header на web-запросе
  if (channel === 'header' && cookieSid === null) {
    const userAgent = getHeader(event, 'user-agent') || null;
    const isWeb = userAgent
      ? !/Mobile|Android|iPhone|iPad/i.test(userAgent)
      : false;
    if (isWeb) {
      try {
        const ip = getClientIp(event);
        await db.insert(securityEvents).values({
          userId: null,
          eventType: 'auth_header_used_on_web',
          ipAddress: ip,
          userAgent: userAgent,
          metadata: {},
        });
      } catch (error) {
        console.error('[Session] Failed to log header used on web:', error);
      }
    }
  }

  if (!sid) return null;

  // Валидируем сессию в БД
  const now = new Date();
  const rows = await db
    .select({ id: sessions.id, userId: sessions.userId })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sid),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now)
      )
    )
    .limit(1);

  if (!rows.length) return null;

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, rows[0].userId))
    .limit(1);

  if (!user.length) {
    await purgeSessionForMissingUser(
      event,
      sid,
      cookieSid,
      rows[0].userId,
      'user_missing'
    );
    return null;
  }

  if (user[0].deletedAt) {
    await purgeSessionForMissingUser(
      event,
      sid,
      cookieSid,
      user[0].id,
      'user_missing'
    );
    return null;
  }

  if (user[0].isBlocked) {
    await purgeSessionForMissingUser(
      event,
      sid,
      cookieSid,
      user[0].id,
      'user_blocked'
    );
    return null;
  }

  // Автоматическое продление сессии при активности
  const newExpiresAt = await maybeExtendSession(sid, now);
  if (newExpiresAt && channel === 'cookie') {
    const sameSitePolicy = isProd ? 'strict' : 'lax';
    const sessionCookieName = getCookieName(SESSION_COOKIE_NAME, isProd);

    setCookie(event, sessionCookieName, sid, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSitePolicy,
      path: '/',
      ...(isProd ? {} : { domain: undefined }),
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    const csrfToken = getCSRFTokenFromCookie(event) ?? generateCSRFToken();
    setCSRFCookie(event, csrfToken, newExpiresAt);
  }

  return { user: user[0], channel };
}

async function purgeSessionForMissingUser(
  event: any,
  sessionId: string,
  cookieSid: string | null,
  userId: number,
  reason: 'user_missing' | 'user_blocked'
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));

  if (cookieSid && cookieSid === sessionId) {
    const sessionCookieName = getCookieName(SESSION_COOKIE_NAME, isProd);
    const csrfCookieName = getCookieName(CSRF_COOKIE_NAME, isProd);
    deleteCookie(event, sessionCookieName, { path: '/' });
    deleteCookie(event, csrfCookieName, { path: '/' });
  }

  try {
    await db.insert(securityEvents).values({
      userId: reason === 'user_blocked' ? userId : null,
      eventType:
        reason === 'user_blocked'
          ? 'session_revoked_blocked_user'
          : 'session_orphaned_user',
      ipAddress: getClientIp(event),
      userAgent: getHeader(event, 'user-agent') || null,
      metadata: {
        sessionId: `${sessionId.slice(0, 8)}...`,
        sessionUserId: userId,
      },
    });
  } catch (error) {
    console.error('[Session] Failed to log orphaned session event:', error);
  }
}

/**
 * Автоматическое продление сессии при активности
 * Возвращает новый expiresAt если сессия была продлена, иначе null
 */
async function maybeExtendSession(
  sessionId: string,
  now: Date
): Promise<Date | null> {
  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session.length) return null;

  const s = session[0];
  const expiresAt = new Date(s.expiresAt);
  const lastExtendedAt = s.lastExtendedAt ? new Date(s.lastExtendedAt) : null;

  // Проверяем абсолютный максимум (60 дней)
  const createdAt = new Date(s.createdAt);
  const absoluteMaxExpires = new Date(
    createdAt.getTime() + SESSION_ABSOLUTE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  );
  if (now >= absoluteMaxExpires) {
    // Сессия достигла абсолютного максимума, не продлеваем
    return null;
  }

  // Проверяем, истекает ли сессия в течение 1 дня
  const extendThreshold = new Date(
    now.getTime() + SESSION_EXTEND_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
  );
  if (expiresAt > extendThreshold) {
    // Еще не истекает, не продлеваем
    return null;
  }

  // Проверяем cooldown (не продлевать чаще 1 раза в 12 часов)
  if (lastExtendedAt) {
    const cooldownEnd = new Date(
      lastExtendedAt.getTime() + SESSION_EXTEND_COOLDOWN_HOURS * 60 * 60 * 1000
    );
    if (now < cooldownEnd) {
      // Еще не прошло 12 часов с последнего продления
      return null;
    }
  }

  // Продлеваем сессию на 7 дней
  const newExpiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await db
    .update(sessions)
    .set({
      expiresAt: newExpiresAt,
      lastExtendedAt: now,
    })
    .where(eq(sessions.id, sessionId));

  return newExpiresAt;
}

/**
 * Ревокация сессии
 */
export async function revokeSession(event: any): Promise<void> {
  const sessionCookieName = getCookieName(SESSION_COOKIE_NAME, isProd);
  const cookieSid = getCookie(event, sessionCookieName) || null;
  const headerSidRaw = getHeader(event, 'x-session-token');
  const headerSid =
    headerSidRaw && headerSidRaw.trim() ? headerSidRaw.trim() : null;
  const revokedAt = new Date();

  if (cookieSid) {
    await db
      .update(sessions)
      .set({ revokedAt })
      .where(eq(sessions.id, cookieSid));
  }
  if (headerSid && headerSid !== cookieSid) {
    await db
      .update(sessions)
      .set({ revokedAt })
      .where(eq(sessions.id, headerSid));
  }
  deleteCookie(event, sessionCookieName, { path: '/' });

  // Удаляем CSRF cookie
  const { CSRF_COOKIE_NAME } = await import('./cookie-names');
  const csrfCookieName = getCookieName(CSRF_COOKIE_NAME, isProd);
  deleteCookie(event, csrfCookieName, { path: '/' });
}

/**
 * Ревокация всех сессий пользователя
 */
export async function revokeAllUserSessions(
  userId: number,
  excludeSessionId?: string
): Promise<void> {
  const conditions: any[] = [
    eq(sessions.userId, userId),
    isNull(sessions.revokedAt),
  ];

  if (excludeSessionId) {
    const { ne } = await import('drizzle-orm');
    conditions.push(ne(sessions.id, excludeSessionId));
  }

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions));

  // Логируем событие
  try {
    await db.insert(securityEvents).values({
      userId,
      eventType: 'logout_everywhere',
      ipAddress: null,
      userAgent: null,
      metadata: { excludeSessionId },
    });
  } catch (error) {
    console.error('[Session] Failed to log logout_everywhere:', error);
  }
}

/**
 * Ротация session ID (защита от session fixation)
 */
export async function rotateSessionId(
  event: any,
  userId: number,
  locale?: string
): Promise<string> {
  const sessionCookieName = getCookieName(SESSION_COOKIE_NAME, isProd);
  const oldSid = getCookie(event, sessionCookieName);

  // Ревокация старой сессии
  if (oldSid) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, oldSid));
  }

  // Создаем новую сессию
  const newSid = await createSession(event, userId, locale);

  // Ротация CSRF токена (пересоздаем)
  const csrfToken = generateCSRFToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  setCSRFCookie(event, csrfToken, expires);

  return newSid;
}
