import { OAuth2Client } from 'google-auth-library';
import { createError } from 'h3';
import { GoogleNativeAuthDto } from '@/shared/dto/auth';
import { upsertUserWithOAuth } from '@/server/application/auth/oauth';
import { buildOAuthAuthResponse } from '@/server/application/auth/oauth-linking.service';

const oauthClient = new OAuth2Client();

export default defineEventHandler(async (event) => {
  const body = GoogleNativeAuthDto.parse(await readBody(event as any));
  const cfg = useRuntimeConfig(event);

  const webClientId =
    cfg.public.googleWebClientId ||
    cfg.OAUTH_GOOGLE_CLIENT_ID ||
    process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;

  const iosClientId =
    cfg.public.googleIosClientId ||
    process.env.NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  const audiences = [
    ...new Set(
      [webClientId, iosClientId]
        .filter((value): value is string => {
          return typeof value === 'string' && value.trim().length > 0;
        })
        .map((value) => value.trim())
    ),
  ];

  if (!audiences.length) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Google client id не настроен (web/iOS)',
    });
  }

  let payload:
    | {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
        locale?: string;
      }
    | undefined;

  try {
    const audience: string | string[] =
      audiences.length === 1 ? audiences[0] : audiences;

    const ticket = await oauthClient.verifyIdToken({
      idToken: body.idToken,
      // Для native токен может прийти с web/iOS audience в зависимости от платформы OAuth.
      audience,
    });
    payload = ticket.getPayload();
  } catch (error: any) {
    console.error('[Auth] Google ID token verification failed:', error);
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверный Google токен',
    });
  }

  if (!payload?.sub) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Неверные данные Google токена',
    });
  }

  const email = payload.email || null;
  const emailVerified = payload.email_verified === true;
  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Google не вернул email',
    });
  }

  if (!emailVerified) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email в Google не подтвержден',
    });
  }

  const result = await upsertUserWithOAuth(event, 'google', {
    providerUserId: payload.sub,
    email,
    emailVerified,
    name: payload.name || null,
    avatarUrl: payload.picture || null,
    locale: payload.locale || null,
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
