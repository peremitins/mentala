import { createError } from 'h3';
import type { ExternalSessionPurpose } from '@/server/application/auth/external-session.service';
import { createExternalSessionTransferToken } from '@/server/application/auth/external-session.service';
import { getClientIp } from '@/server/utils/ip';

function sanitizeRedirectPath(path: string): string {
  const normalized = String(path || '').trim();
  if (!normalized.startsWith('/')) return '/subscription';
  if (normalized.startsWith('//')) return '/subscription';
  return normalized;
}

export async function buildExternalSessionConsumeReturnUrl(params: {
  event: any;
  userId: number;
  appUrl: string;
  redirectPath: string;
  ttlSeconds?: number;
  purpose?: ExternalSessionPurpose;
}): Promise<string> {
  const appUrl = String(params.appUrl || '')
    .trim()
    .replace(/\/+$/, '');
  if (!appUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'External return app URL is required',
    });
  }

  const redirectPath = sanitizeRedirectPath(params.redirectPath);
  // Выпускаем одноразовый токен, чтобы внешний браузер мог восстановить cookie-сессию.
  const tokenData = await createExternalSessionTransferToken({
    userId: params.userId,
    ipAddress: getClientIp(params.event),
    userAgent: params.event?.node?.req?.headers?.['user-agent'] || null,
    ttlSeconds: params.ttlSeconds,
    purpose: params.purpose,
  });

  return `${appUrl}/auth/external-session/consume?token=${encodeURIComponent(tokenData.token)}&redirect=${encodeURIComponent(redirectPath)}`;
}
