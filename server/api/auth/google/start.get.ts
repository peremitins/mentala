import { makeState, setOAuthCookies } from '@/server/application/auth/oauth';

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event);
  const clientId =
    cfg.OAUTH_GOOGLE_CLIENT_ID || process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;
  const appUrl = cfg.public.appUrl || 'http://localhost:3000';

  const query = getQuery(event);
  // Было: const redirectUri = String(query.redirect_uri || `${appUrl}`)
  const redirectUri = String(query.redirect_uri || `${appUrl}/`); // ставим / на конец
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
  console.log('redirect1', params.toString());
  return sendRedirect(
    event,
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    302
  );
});
