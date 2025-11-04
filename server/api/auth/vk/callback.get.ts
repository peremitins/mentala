import {
  consumeOAuthCookies,
  need,
  upsertUserWithOAuth,
} from '@/server/application/auth/oauth';

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event);
  const clientId =
    cfg.OAUTH_VK_CLIENT_ID || process.env.NUXT_OAUTH_VK_CLIENT_ID;
  const clientSecret =
    cfg.OAUTH_VK_CLIENT_SECRET || process.env.NUXT_OAUTH_VK_CLIENT_SECRET;
  const appUrl = cfg.public.appUrl || 'http://localhost:3000';

  const { code, state } = getQuery(event);
  const { state: saved, redirect, locale } = consumeOAuthCookies(event);
  need(code, 400, 'Missing code');
  need(state && saved && state === saved, 400, 'Invalid state');

  const tokenRes = await $fetch<any>('https://oauth.vk.com/access_token', {
    query: {
      client_id: String(clientId),
      client_secret: String(clientSecret),
      redirect_uri: `${appUrl}/api/auth/vk/callback`,
      code: String(code),
      v: '5.199',
    },
  });

  const providerUserId = String(tokenRes.user_id);
  const email = tokenRes.email || null;

  const usersGet = await $fetch<any>('https://api.vk.com/method/users.get', {
    query: {
      user_ids: providerUserId,
      fields: 'photo_200,first_name,last_name',
      access_token: tokenRes.access_token,
      v: '5.199',
    },
  });
  const info = usersGet.response?.[0] || {};
  const name =
    [info.first_name, info.last_name].filter(Boolean).join(' ') || null;
  const avatarUrl = info.photo_200 || null;

  await upsertUserWithOAuth(
    event,
    'vk',
    {
      providerUserId,
      email,
      name,
      avatarUrl,
      locale: locale ?? null,
    },
    {
      access_token: tokenRes.access_token,
      refresh_token: null,
      expires_at: undefined,
    }
  );

  return sendRedirect(event, String(redirect || '/'), 302);
});
