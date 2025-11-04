import { makeState, setOAuthCookies } from '@/server/application/auth/oauth';

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event);
  const clientId =
    cfg.OAUTH_VK_CLIENT_ID || process.env.NUXT_OAUTH_VK_CLIENT_ID;
  const appUrl = cfg.public.appUrl || 'http://localhost:3000';

  const query = getQuery(event);
  const redirectUri = String(query.redirect_uri || `${appUrl}`);
  const locale = query.locale ? String(query.locale) : undefined;
  const state = makeState();

  setOAuthCookies(event, state, redirectUri, locale);

  const params = new URLSearchParams({
    client_id: String(clientId),
    display: 'page',
    redirect_uri: `${appUrl}/api/auth/vk/callback`,
    response_type: 'code',
    scope: 'email',
    state,
    v: '5.199',
  });
  return sendRedirect(
    event,
    `https://oauth.vk.com/authorize?${params.toString()}`,
    302
  );
});
