import {
  consumeOAuthCookies,
  getGoogleOAuthReplayRedirect,
  need,
  postForm,
  storeGoogleOAuthReplayRedirect,
  upsertUserWithOAuth,
  waitForGoogleOAuthReplayRedirect,
} from '@/server/application/auth/oauth';
import { resolveAppUrl } from '@/server/application/auth/oauth-redirect';
import { extractMarketingAttributionFromSearchParams } from '@/shared/utils/marketingAttribution';

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
  const stateValue = typeof state === 'string' ? state : String(state || '');
  const { state: saved, redirect, locale } = consumeOAuthCookies(event);
  need(code, 400, 'Missing code');
  if (!(stateValue && saved && stateValue === saved)) {
    const replayRedirect = await getGoogleOAuthReplayRedirect(stateValue);
    if (replayRedirect) {
      return sendRedirect(event, replayRedirect, 303);
    }

    need(false, 400, 'Invalid state');
  }
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

    if (errorCode === 'invalid_grant') {
      const replayRedirect = await waitForGoogleOAuthReplayRedirect(stateValue);
      if (replayRedirect) {
        console.warn('[OAuth] Повторный Google callback использовал replay', {
          state: stateValue,
        });
        return sendRedirect(event, replayRedirect, 303);
      }
    }

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
    const replayRedirect = `${appUrl}/auth?error=email_required`;
    await storeGoogleOAuthReplayRedirect(stateValue, replayRedirect);
    return sendRedirect(event, replayRedirect, 303);
  }

  if (!emailVerified) {
    const replayRedirect = `${appUrl}/auth?error=email_not_verified`;
    await storeGoogleOAuthReplayRedirect(stateValue, replayRedirect);
    return sendRedirect(event, replayRedirect, 303);
  }

  const redirectUrl = redirect
    ? new URL(redirect, appUrl)
    : new URL('/', appUrl);
  const marketingAttribution = extractMarketingAttributionFromSearchParams(
    redirectUrl.searchParams,
    {
      landingUrl: redirectUrl.toString(),
      capturedAt: new Date().toISOString(),
    }
  );

  const result = await upsertUserWithOAuth(event, 'google', {
    providerUserId,
    email,
    emailVerified,
    name,
    avatarUrl,
    locale: locale ?? null,
    marketingAttribution,
  });

  if (result.status === 'linking_required') {
    console.log('[OAuth] Linking required for email:', result.email);
    const linkUrl = new URL('/auth/link', appUrl);
    linkUrl.searchParams.set('token', result.linkingToken);
    linkUrl.searchParams.set('email', result.email);
    linkUrl.searchParams.set('back', redirectUrl.toString());
    console.log('[OAuth] Redirecting to:', linkUrl.toString());
    await storeGoogleOAuthReplayRedirect(stateValue, linkUrl.toString());
    return sendRedirect(event, linkUrl.toString(), 303);
  }

  const finalRedirect = redirect || `${appUrl}/`;
  await storeGoogleOAuthReplayRedirect(stateValue, finalRedirect);
  return sendRedirect(event, finalRedirect, 303);
});
