import {
  consumeOAuthCookies,
  need,
  upsertUserWithOAuth,
} from '@/server/application/auth/oauth';
import { resolveAppUrl } from '@/server/application/auth/oauth-redirect';

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event);
  const clientId =
    cfg.OAUTH_VK_CLIENT_ID || process.env.NUXT_OAUTH_VK_CLIENT_ID;
  const clientSecret =
    cfg.OAUTH_VK_CLIENT_SECRET || process.env.NUXT_OAUTH_VK_CLIENT_SECRET;
  const appUrl = resolveAppUrl(event, cfg.public.appUrl);

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
  const emailVerified = Boolean(email);

  if (!email) {
    return sendRedirect(event, `${appUrl}/auth?error=email_required`, 303);
  }

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

  const result = await upsertUserWithOAuth(event, 'vk', {
    providerUserId,
    email,
    emailVerified,
    name,
    avatarUrl,
    locale: locale ?? null,
  });

  if (result.status === 'linking_required') {
    const backUrl = redirect ? new URL(redirect, appUrl) : new URL('/', appUrl);
    const linkUrl = new URL('/auth/link', appUrl);
    linkUrl.searchParams.set('token', result.linkingToken);
    linkUrl.searchParams.set('email', result.email);
    linkUrl.searchParams.set('back', backUrl.toString());
    return sendRedirect(event, linkUrl.toString(), 303);
  }

  return sendRedirect(event, redirect || `${appUrl}/`, 303);
});
