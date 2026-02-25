import { createError, getHeader } from 'h3';
import { z } from 'zod';
import { getSessionUser } from '@/server/application/auth/session';
import { getClientIp } from '@/server/utils/ip';
import { createExternalSessionTransferToken } from '@/server/application/auth/external-session.service';
import { resolveExternalFlowAppUrl } from '@/server/application/auth/oauth-redirect';

const createExternalSessionSchema = z
  .object({
    redirectPath: z.string().trim().optional(),
    ttlSeconds: z.number().int().optional(),
    appUrl: z.string().trim().optional(),
  })
  .default({});

function sanitizeRedirectPath(path: string | undefined): string {
  if (!path) return '/subscription';
  if (!path.startsWith('/')) return '/subscription';
  if (path.startsWith('//')) return '/subscription';
  return path;
}

/**
 * POST /api/auth/external-session/create
 * Выдаёт одноразовый transfer-token для перехода из мобильной сессии в web cookie-сессию.
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const payload = createExternalSessionSchema.parse(
    (await readBody(event)) || {}
  );
  const redirectPath = sanitizeRedirectPath(payload.redirectPath);
  const ipAddress = getClientIp(event);
  const userAgent = getHeader(event, 'user-agent') || null;

  const tokenData = await createExternalSessionTransferToken({
    userId: sessionResult.user.id,
    ipAddress,
    userAgent,
    ttlSeconds: payload.ttlSeconds,
  });

  const config = useRuntimeConfig(event);
  const appUrl = resolveExternalFlowAppUrl({
    event,
    configuredAppUrl: String(config.public.appUrl || 'http://localhost:3000'),
    requestedAppUrl: payload.appUrl,
  });

  const consumeUrl = `${appUrl}/auth/external-session/consume?token=${encodeURIComponent(tokenData.token)}&redirect=${encodeURIComponent(redirectPath)}`;

  return {
    token: tokenData.token,
    consumeUrl,
    redirectPath,
    expiresAt: tokenData.expiresAt.toISOString(),
    ttlSeconds: tokenData.ttlSeconds,
  };
});
