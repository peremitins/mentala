import {
  consumeOAuthCookies,
  need,
  postForm,
  upsertUserWithOAuth,
} from '@/server/application/auth/oauth';
import { resolveAppUrl } from '@/server/application/auth/oauth-redirect';

const isProd = process.env.NODE_ENV === 'production';

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event);
  const clientId =
    cfg.OAUTH_GOOGLE_CLIENT_ID || process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;
  const clientSecret =
    cfg.OAUTH_GOOGLE_CLIENT_SECRET ||
    process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET;
  const appUrl = resolveAppUrl(event, cfg.public.appUrl);

  const { code, state } = getQuery(event);
  const { state: saved, redirect, locale } = consumeOAuthCookies(event);
  need(code, 400, 'Missing code');
  need(state && saved && state === saved, 400, 'Invalid state');
  if (!clientId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Google OAuth не настроен: отсутствует client id',
    });
  }
  if (!clientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Google OAuth не настроен: отсутствует client secret',
    });
  }

  // Не логируем OAuth code (чувствительные данные)
  let tokenRes;
  try {
    tokenRes = await postForm<any>('https://oauth2.googleapis.com/token', {
      client_id: String(clientId),
      client_secret: String(clientSecret),
      code: String(code),
      grant_type: 'authorization_code',
      redirect_uri: `${appUrl}/api/auth/google/callback`,
    });
  } catch (err: any) {
    const errorCode = err?.data?.error || err?.error || 'unknown_error';
    const errorDescription =
      err?.data?.error_description || err?.message || 'Unknown error';
    console.error('Token exchange failed', {
      error: errorCode,
      description: errorDescription,
    });
    throw createError({
      statusCode: 500,
      statusMessage: 'Не удалось обменять токен Google',
      data: isProd
        ? undefined
        : {
            error: errorCode,
            description: errorDescription,
          },
    });
  }

  const u = await $fetch<any>(
    'https://openidconnect.googleapis.com/v1/userinfo',
    {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` },
    }
  );

  const providerUserId = String(u.sub);
  const email = u.email || null;
  const emailVerified = u.email_verified === true;
  const name = u.name || null;
  const avatarUrl = u.picture || null;

  if (!email) {
    return sendRedirect(event, `${appUrl}/auth?error=email_required`, 303);
  }

  if (!emailVerified) {
    return sendRedirect(event, `${appUrl}/auth?error=email_not_verified`, 303);
  }

  const result = await upsertUserWithOAuth(event, 'google', {
    providerUserId,
    email,
    emailVerified,
    name,
    avatarUrl,
    locale: locale ?? null,
  });

  if (result.status === 'linking_required') {
    console.log('[OAuth] Linking required for email:', result.email);
    const backUrl = redirect ? new URL(redirect, appUrl) : new URL('/', appUrl);
    const linkUrl = new URL('/auth/link', appUrl);
    linkUrl.searchParams.set('token', result.linkingToken);
    linkUrl.searchParams.set('email', result.email);
    linkUrl.searchParams.set('back', backUrl.toString());
    console.log('[OAuth] Redirecting to:', linkUrl.toString());
    return sendRedirect(event, linkUrl.toString(), 303);
  }

  return sendRedirect(event, redirect || `${appUrl}/`, 303);
});
