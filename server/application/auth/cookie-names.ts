/**
 * Константы имен cookie
 * Все cookie-имена должны быть через константы, чтобы избежать рассинхронизации
 */

export const SESSION_COOKIE_NAME = 'mentala.sid';
export const CSRF_COOKIE_NAME = 'mentala.csrf';
export const OAUTH_STATE_COOKIE_NAME = 'mentala.oauth.state';
export const OAUTH_REDIRECT_COOKIE_NAME = 'mentala.oauth.redirect';
export const LANG_COOKIE_NAME = 'mentala.lang';

/**
 * Получить имя cookie с учетом префикса __Host- в production
 */
export function getCookieName(baseName: string, isProduction: boolean): string {
  return isProduction ? `__Host-${baseName}` : baseName;
}
