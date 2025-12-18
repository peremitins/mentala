/**
 * Утилиты для работы с CSRF токеном
 */

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k === name && v) return v;
  }
  return null;
}

/**
 * Получает CSRF токен из cookie для использования в заголовках
 * Используется для fetch-запросов, которые не могут использовать $api
 */
export function getCsrfTokenForHeader(): string | null {
  const isProd = import.meta.env?.PROD === true;
  const cookieName = isProd ? '__Host-mentala.csrf' : 'mentala.csrf';
  return readCookieValue(cookieName);
}
