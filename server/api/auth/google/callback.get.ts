import {
  consumeOAuthCookies,
  need,
  postForm,
  upsertUserWithOAuth,
} from '@/server/application/auth/oauth';

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event);
  const clientId =
    cfg.OAUTH_GOOGLE_CLIENT_ID || process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;
  const clientSecret =
    cfg.OAUTH_GOOGLE_CLIENT_SECRET ||
    process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET;
  const appUrl = cfg.public.appUrl || 'http://localhost:3000';

  const { code, state } = getQuery(event);
  const { state: saved, redirect, locale } = consumeOAuthCookies(event);
  need(code, 400, 'Missing code');
  need(state && saved && state === saved, 400, 'Invalid state');

  console.log('GOOGLE OAUTH EXCHANGE', {
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    code,
  });

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
    console.error('Token exchange failed', err.data || err.message);
    throw createError({
      statusCode: 500,
      statusMessage: 'Google token exchange failed',
      data: err.data || err.message,
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
  const name = u.name || null;
  const avatarUrl = u.picture || null;

  await upsertUserWithOAuth(
    event,
    'google',
    {
      providerUserId,
      email,
      name,
      avatarUrl,
      locale: locale ?? null,
    },
    {
      access_token: tokenRes.access_token,
      refresh_token: tokenRes.refresh_token,
      expires_at: tokenRes.expires_in
        ? new Date(Date.now() + tokenRes.expires_in * 1000)
        : undefined,
    }
  );
  console.log('redirect', redirect);
  // return sendRedirect(event, String(redirect || '/'), 302);
  return sendRedirect(event, redirect || `${appUrl}/`, 303);
});
