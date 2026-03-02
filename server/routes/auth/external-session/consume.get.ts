import {
  createError,
  getHeader,
  getQuery,
  getRequestProtocol,
  sendRedirect,
} from 'h3';
import { getClientIp } from '@/server/utils/ip';
import { createSession } from '@/server/application/auth/session';
import {
  consumeExternalSessionTransferToken,
  type ExternalSessionPurpose,
  ExternalSessionConsumeError,
} from '@/server/application/auth/external-session.service';

function sanitizeRedirectPath(path: unknown): string {
  if (typeof path !== 'string' || !path.trim()) return '/subscription';
  const normalized = path.trim();
  if (!normalized.startsWith('/')) return '/subscription';
  if (normalized.startsWith('//')) return '/subscription';
  return normalized;
}

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function resolveConsumePurpose(redirectPath: string): ExternalSessionPurpose {
  let parsed: URL;
  try {
    parsed = new URL(redirectPath, 'http://local');
  } catch {
    return 'browser_handoff';
  }

  const pathname = String(parsed.pathname || '').replace(/\/+$/, '') || '/';
  if (pathname === '/payment-success') {
    return 'payment_return';
  }

  if (pathname !== '/subscription') {
    return 'browser_handoff';
  }

  const flow = String(parsed.searchParams.get('flow') || '')
    .trim()
    .toLowerCase();
  if (flow === 'payment' || flow === 'bind') {
    return 'payment_return';
  }

  if (
    isTruthyFlag(parsed.searchParams.get('paymentReturn')) ||
    isTruthyFlag(parsed.searchParams.get('bindReturn'))
  ) {
    return 'payment_return';
  }

  return 'browser_handoff';
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
  const purpose = resolveConsumePurpose(redirectPath);
  const ipAddress = getClientIp(event);
  const userAgent = getHeader(event, 'user-agent') || null;
  const requestProtocol = getRequestProtocol(event, { xForwardedProto: true });
  const isHttps = String(requestProtocol || '').toLowerCase() === 'https';

  try {
    const consumed = await consumeExternalSessionTransferToken({
      token,
      ipAddress,
      userAgent,
      purpose,
    });

    // Для возврата из внешнего браузера нужен Lax,
    // иначе Strict-cookie может не примениться в cross-site redirect цепочке.
    // На LAN/http (dev) secure-cookie также недопустим.
    await createSession(event, consumed.userId, undefined, {
      sameSite: purpose === 'payment_return' ? 'lax' : undefined,
      secure: isHttps,
    });
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
