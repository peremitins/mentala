import { createError } from 'h3';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppleNativeAuthDto } from '@/shared/dto/auth';
import { upsertUserWithOAuth } from '@/server/application/auth/oauth';
import { buildOAuthAuthResponse } from '@/server/application/auth/oauth-linking.service';

// Публичные ключи Apple кешируются автоматически через jose
const APPLE_JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys')
);

const APPLE_ISSUER = 'https://appleid.apple.com';

export default defineEventHandler(async (event) => {
  const body = AppleNativeAuthDto.parse(await readBody(event as any));
  const cfg = useRuntimeConfig(event);

  const bundleId =
    String(process.env.NUXT_APPLE_IAP_BUNDLE_IDS || cfg.appleIapBundleIds || '')
      .split(',')[0]
      .trim() || 'com.mentala.app';

  let payload: {
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    is_private_email?: boolean | string;
    name?: string;
  };

  try {
    const { payload: jwtPayload } = await jwtVerify(
      body.identityToken,
      APPLE_JWKS,
      {
        issuer: APPLE_ISSUER,
        audience: bundleId,
      }
    );
    payload = jwtPayload as typeof payload;
  } catch (error: any) {
    console.error('[Auth] Apple identity token verification failed:', {
      error: error instanceof Error ? error.message : String(error),
      bundleId,
    });
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверный Apple токен',
    });
  }

  if (!payload.sub) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Неверные данные Apple токена',
    });
  }

  // Apple скрывает email пользователей через Private Email Relay
  // Relay-адрес вида xxxx@privaterelay.appleid.com — всё равно валидный email
  const email = payload.email || null;
  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Apple не вернул email. Убедитесь, что вы разрешили доступ к email при входе.',
    });
  }

  // Имя приходит только при первом входе — берём из тела запроса (плагин его передаёт)
  const firstName = body.firstName?.trim() || null;
  const lastName = body.lastName?.trim() || null;
  const name =
    [firstName, lastName].filter(Boolean).join(' ').trim() || null;

  const result = await upsertUserWithOAuth(event, 'apple', {
    providerUserId: payload.sub,
    email,
    emailVerified: true, // Apple верифицирует email самостоятельно
    name,
    avatarUrl: null, // Apple не отдаёт аватар
    locale: null,
  });

  if (result.status === 'linking_required') {
    return {
      requiresAccountLinking: true,
      linkingToken: result.linkingToken,
      email: result.email,
    };
  }

  return await buildOAuthAuthResponse(event, result.userId);
});
