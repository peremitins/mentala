import { makeState, setOAuthCookies } from '@/server/application/auth/oauth';
import { resolveAppUrl } from '@/server/application/auth/oauth-redirect';

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event);
  const clientId =
    cfg.OAUTH_GOOGLE_CLIENT_ID || process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;
  const appUrl = resolveAppUrl(event, cfg.public.appUrl);
  if (!clientId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Google OAuth не настроен: отсутствует client id',
    });
  }

  const query = getQuery(event);
  const redirectUri = String(query.redirect_uri || `${appUrl}/`);
  const locale = query.locale ? String(query.locale) : undefined;
  const state = makeState();

  setOAuthCookies(event, state, encodeURIComponent(redirectUri), locale);

  const params = new URLSearchParams({
    client_id: String(clientId),
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'consent',
  });
  return sendRedirect(
    event,
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    302
  );
});
