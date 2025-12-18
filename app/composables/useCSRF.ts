import { useCookie } from '#app';

const isProd = process.env.NODE_ENV === 'production';
const CSRF_COOKIE_NAME = isProd ? '__Host-mentala.csrf' : 'mentala.csrf';

/**
 * Composable для работы с CSRF токеном
 * Используется только для web (Capacitor не требует CSRF)
 */
export function useCSRF() {
  /**
   * Получает CSRF токен из cookie
   */
  function getToken(): string | null {
    if (typeof document === 'undefined') return null;

    // Используем useCookie для SSR-safe доступа
    const csrfCookie = useCookie(CSRF_COOKIE_NAME, {
      httpOnly: false, // CSRF cookie не httpOnly
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
    });

    return csrfCookie.value || null;
  }

  /**
   * Получает CSRF токен для использования в заголовке
   */
  function getTokenForHeader(): string | null {
    return getToken();
  }

  return {
    getToken,
    getTokenForHeader,
  };
}

