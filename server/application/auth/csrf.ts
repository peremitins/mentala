import { randomBytes } from 'node:crypto';
import { setCookie, getCookie } from 'h3';
import { CSRF_COOKIE_NAME, getCookieName } from './cookie-names';

const isProd = process.env.NODE_ENV === 'production';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 дней
export type SessionCookieSameSite = 'strict' | 'lax';

/**
 * Генерирует CSRF токен (32 символа hex)
 */
export function generateCSRFToken(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Устанавливает CSRF токен в cookie
 */
export function setCSRFCookie(
  event: any,
  csrfToken: string,
  sessionExpiresAt?: Date,
  options?: {
    sameSite?: SessionCookieSameSite;
    secure?: boolean;
  }
): void {
  const csrfCookieName = getCookieName(CSRF_COOKIE_NAME, isProd);

  // maxAge для CSRF cookie = maxAge сессии (динамически)
  const sessionMaxAge = sessionExpiresAt
    ? Math.floor((sessionExpiresAt.getTime() - Date.now()) / 1000)
    : SESSION_MAX_AGE_SECONDS; // fallback на константу

  // Для сессии и CSRF: strict в prod, lax в dev.
  // Для external payment return policy может быть ослаблена до lax
  // через явный override в options.
  const sameSitePolicy: SessionCookieSameSite =
    options?.sameSite || (isProd ? 'strict' : 'lax');
  const secureCookie =
    typeof options?.secure === 'boolean' ? options.secure : isProd;

  setCookie(event, csrfCookieName, csrfToken, {
    httpOnly: false, // для CSRF (Double Submit Cookie паттерн)
    secure: secureCookie,
    sameSite: sameSitePolicy,
    path: '/', // обязательно для __Host- префикса
    // Для __Host- префикса не указывать domain
    ...(isProd ? {} : { domain: undefined }),
    maxAge: sessionMaxAge, // динамически = срок жизни сессии
  });
}

/**
 * Получает CSRF токен из cookie
 */
export function getCSRFToken(event: any): string | null {
  const csrfCookieName = getCookieName(CSRF_COOKIE_NAME, isProd);
  return getCookie(event, csrfCookieName) || null;
}
