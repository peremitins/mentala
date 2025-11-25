import { randomUUID } from 'node:crypto';
import { setCookie, getCookie, deleteCookie, getHeader } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { sessions, users } from '@/server/infrastructure/db/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';

const isProd = process.env.NODE_ENV === 'production';
const SID = 'mentai.sid';
const LANG = 'mentai.lang';

export async function createSession(
  event: any,
  userId: number,
  locale?: string
) {
  const id = randomUUID();
  const ua = event.node?.req?.headers['user-agent'] || null;
  const ip =
    (event.node?.req?.headers['x-forwarded-for'] as string)
      ?.split(',')[0]
      ?.trim() ||
    (event.node?.req?.socket as any)?.remoteAddress ||
    null;
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    id,
    userId,
    userAgent: ua,
    ip,
    createdAt: now,
    expiresAt: expires,
  });
  setCookie(event, SID, id, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  if (locale) {
    setCookie(event, LANG, locale, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });
  }
  // Возвращаем ID сессии для использования в заголовке X-Session-Token
  // если cookies не передаются (например, cross-domain)
  return id;
}

export async function getSessionUser(event: any) {
  // Сначала проверяем cookie (для Web)
  let sid = getCookie(event, SID);

  // Если cookie нет, проверяем заголовок X-Session-Token
  // Это fallback для случаев, когда cookies не передаются (например, cross-domain или Capacitor)
  if (!sid) {
    const tokenHeader = getHeader(event, 'x-session-token');
    if (tokenHeader) {
      sid = tokenHeader.trim();
    }
  }

  // Логирование для отладки на мобильных устройствах
  const userAgent = getHeader(event, 'user-agent') || '';
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  if (isMobile && !sid) {
    console.log(
      '[Session] Mobile request without session token - cookies:',
      !!getCookie(event, SID),
      'header:',
      !!getHeader(event, 'x-session-token')
    );
  }

  if (!sid) return null;
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
  const u = await db
    .select()
    .from(users)
    .where(eq(users.id, rows[0].userId))
    .limit(1);
  return u[0] || null;
}

export async function revokeSession(event: any) {
  const sid = getCookie(event, SID);
  if (sid) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sid));
  }
  deleteCookie(event, SID, { path: '/' });
}
