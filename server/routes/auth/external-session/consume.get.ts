import { createError, getHeader, getQuery, sendRedirect } from 'h3';
import { getClientIp } from '@/server/utils/ip';
import { createSession } from '@/server/application/auth/session';
import {
  consumeExternalSessionTransferToken,
  ExternalSessionConsumeError,
} from '@/server/application/auth/external-session.service';

function sanitizeRedirectPath(path: unknown): string {
  if (typeof path !== 'string' || !path.trim()) return '/subscription';
  const normalized = path.trim();
  if (!normalized.startsWith('/')) return '/subscription';
  if (normalized.startsWith('//')) return '/subscription';
  return normalized;
}

/**
 * GET /auth/external-session/consume?token=...
 * Поглощает одноразовый transfer-token, создает web cookie-сессию и редиректит в billing flow.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const rawToken = query.token;
  const token =
    typeof rawToken === 'string' && rawToken.trim().length > 0
      ? rawToken.trim()
      : '';

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing external session token',
    });
  }

  const redirectPath = sanitizeRedirectPath(query.redirect);
  const ipAddress = getClientIp(event);
  const userAgent = getHeader(event, 'user-agent') || null;

  try {
    const consumed = await consumeExternalSessionTransferToken({
      token,
      ipAddress,
      userAgent,
    });

    await createSession(event, consumed.userId);
  } catch (error) {
    if (error instanceof ExternalSessionConsumeError) {
      const isHighRisk = error.code === 'high_risk_mismatch';
      throw createError({
        statusCode: isHighRisk ? 403 : 401,
        statusMessage:
          'Invalid, expired or already used external session token',
      });
    }
    throw error;
  }

  return sendRedirect(event, redirectPath, 302);
});
