import { getHeader } from 'h3';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Получает список разрешенных origins
 */
function getAllowedOrigins(): string[] {
  if (isProd) {
    // В production: брать из env, не захардкодивать
    const publicAppOrigin = process.env.PUBLIC_APP_ORIGIN;
    if (publicAppOrigin) {
      return [publicAppOrigin];
    }

    const allowedOrigins = process.env.ALLOWED_ORIGINS;
    if (allowedOrigins) {
      return allowedOrigins.split(',').map((o) => o.trim());
    }

    throw new Error(
      'PUBLIC_APP_ORIGIN or ALLOWED_ORIGINS must be set in production'
    );
  } else {
    // В development: whitelist из env
    const devOrigins = process.env.DEV_ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];
    return devOrigins.map((o) => o.trim());
  }
}

/**
 * Проверяет Origin/Referer для cookie-канала
 * Возвращает true если origin разрешен
 * 
 * ВАЖНО: Для Capacitor (header-канал) эта проверка не применяется,
 * так как Capacitor использует X-Session-Token header, а не cookies
 */
export function verifyOrigin(event: any): boolean {
  // Для Capacitor (если есть X-Session-Token header) - пропускаем проверку
  // Capacitor не использует cookies, поэтому Origin проверка не нужна
  const sessionToken = getHeader(event, 'x-session-token');
  if (sessionToken) {
    // Это Capacitor запрос - Origin проверка не требуется
    return true;
  }

  const origin = getHeader(event, 'origin');
  const referer = getHeader(event, 'referer');
  const allowedOrigins = getAllowedOrigins();

  // Точное совпадение origin (scheme + host + port)
  if (origin) {
    return allowedOrigins.includes(origin);
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return allowedOrigins.includes(refererUrl.origin);
    } catch {
      return false;
    }
  }

  // Если нет Origin и Referer, но это не Capacitor - это может быть проблема
  // Но для некоторых запросов (например, из мобильного браузера) это нормально
  // Возвращаем false, но это не блокирует запрос (только логируется)
  return false; // Нет Origin и Referer
}

