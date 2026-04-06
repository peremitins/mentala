import { defineEventHandler, getMethod, getHeader, createError } from 'h3';
import { getSessionUser } from '@/server/application/auth/session';
import { getCSRFToken } from '@/server/application/auth/csrf';
import { verifyOrigin } from '@/server/utils/origin';
import { db } from '@/server/infrastructure/db/client';
import { securityEvents } from '@/server/infrastructure/db/schema';
import { getClientIp } from '@/server/utils/ip';

/**
 * Проверяет, является ли метод state-changing
 */
function isStateChangingMethod(method: string): boolean {
  return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
}

/**
 * Проверяет, является ли endpoint публичным (исключен из CSRF)
 */
function isPublicEndpoint(path: string): boolean {
  // Публичные endpoints, исключенные из CSRF проверки
  // Правило: исключения применяются только для публичных endpoints
  // и не должны включать ничего, что меняет состояние при наличии cookie-auth пользователя
  const publicPaths = [
    '/api/auth/email/login',
    '/api/auth/email/register',
    '/api/auth/email/verify',
    '/api/auth/email/resend-code',
    '/api/auth/email/request-verification',
    '/api/auth/password/forgot',
    '/api/auth/password/reset',
    '/api/auth/oauth/link-verify-password',
    '/api/auth/oauth/link-send-code',
    '/api/auth/oauth/link-verify-code',
    '/api/auth/oauth/link-cancel',
    '/api/auth/google/callback',
    '/api/auth/google/native',
    '/api/auth/vk/callback',
    '/api/payments/yookassa/webhook',
    '/api/app/update-policy',
  ];

  // Проверяем точное совпадение или паттерн для OAuth callbacks
  if (publicPaths.includes(path)) return true;
  if (path.match(/^\/api\/auth\/[^/]+\/callback$/)) return true;

  return false;
}

/**
 * CSRF middleware
 * Порядок выполнения:
 * 1. Попытка аутентификации (cookie/header) — определить канал и валидировать сессию
 * 2. Если выбрана cookie-сессия и метод state-changing → CSRF check
 * 3. Затем обработчик endpoint
 */
export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const rawUrl = event.node.req.url || '';
  const path = rawUrl.split('?')[0] || '';

  // Пропускаем GET/HEAD/OPTIONS (не state-changing)
  if (!isStateChangingMethod(method)) {
    return;
  }

  // Пропускаем публичные endpoints
  if (isPublicEndpoint(path)) {
    return;
  }

  // Шаг 1: Попытка аутентификации — определяем канал
  const sessionResult = await getSessionUser(event);
  if (!sessionResult) {
    // Нет аутентификации, CSRF не требуется
    return;
  }

  const { channel } = sessionResult;

  // Шаг 2: CSRF проверка только для cookie-канала
  if (channel !== 'cookie') {
    // Header-канал (Capacitor) — CSRF не требуется
    return;
  }

  // Для cookie-канала проверяем CSRF токен
  const csrfTokenFromCookie = getCSRFToken(event);
  const csrfTokenFromHeaderRaw = getHeader(event, 'x-csrf-token');
  const csrfTokenFromHeader =
    csrfTokenFromHeaderRaw && csrfTokenFromHeaderRaw.trim()
      ? csrfTokenFromHeaderRaw.trim()
      : null;

  if (!csrfTokenFromCookie || !csrfTokenFromHeader) {
    // Нет CSRF токена
    console.warn('[CSRF] Missing token:', {
      path,
      method,
      hasCookie: !!csrfTokenFromCookie,
      hasHeader: !!csrfTokenFromHeader,
      userId: sessionResult.user.id,
    });
    await logCSRFFailure(event, sessionResult.user.id, 'missing_token');
    throw createError({
      statusCode: 403,
      statusMessage: 'CSRF token required',
    });
  }

  if (csrfTokenFromCookie !== csrfTokenFromHeader) {
    // Несовпадение токенов
    await logCSRFFailure(event, sessionResult.user.id, 'token_mismatch');
    throw createError({
      statusCode: 403,
      statusMessage: 'CSRF token mismatch',
    });
  }

  // Дополнительная проверка Origin/Referer для cookie-канала
  if (!verifyOrigin(event)) {
    await logOriginMismatch(event, sessionResult.user.id);
    // Не блокируем, но логируем (это дополнительный слой)
  }
});

/**
 * Логирует CSRF failure
 */
async function logCSRFFailure(
  event: any,
  userId: number,
  reason: 'missing_token' | 'token_mismatch'
): Promise<void> {
  try {
    const ip = getClientIp(event);
    const userAgent = event.node?.req?.headers['user-agent'] || null;
    await db.insert(securityEvents).values({
      userId,
      eventType: 'csrf_mismatch',
      ipAddress: ip,
      userAgent: userAgent,
      metadata: { reason },
    });
  } catch (error) {
    console.error('[CSRF] Failed to log CSRF failure:', error);
  }
}

/**
 * Логирует origin mismatch
 */
async function logOriginMismatch(event: any, userId: number): Promise<void> {
  try {
    const ip = getClientIp(event);
    const userAgent = event.node?.req?.headers['user-agent'] || null;
    const origin = getHeader(event, 'origin');
    const referer = getHeader(event, 'referer');
    await db.insert(securityEvents).values({
      userId,
      eventType: 'origin_mismatch',
      ipAddress: ip,
      userAgent: userAgent,
      metadata: { origin, referer },
    });
  } catch (error) {
    console.error('[CSRF] Failed to log origin mismatch:', error);
  }
}
