import { randomBytes } from 'node:crypto';
import { setCookie, getCookie, deleteCookie, createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users, oauthAccounts } from '@/server/infrastructure/db/schema';
import { eq, and } from 'drizzle-orm';
import { createSession } from './session';

const STATE_COOKIE = 'mentai.oauth.state';
const REDIR_COOKIE = 'mentai.oauth.redirect';
const LOCALE_COOKIE = 'mentai.lang';
const isProd = process.env.NODE_ENV === 'production';

export type Provider = 'google' | 'vk';

export function makeState() {
  return randomBytes(16).toString('hex');
}

export function setOAuthCookies(
  event: any,
  state: string,
  redirectUri?: string,
  locale?: string
) {
  setCookie(event, STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  if (redirectUri) {
    setCookie(event, REDIR_COOKIE, redirectUri, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
  }
  if (locale) {
    setCookie(event, LOCALE_COOKIE, locale, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 3600,
    });
  }
}

// export function consumeOAuthCookies(event: any) {
//   const state = getCookie(event, STATE_COOKIE);
//   const redirect = getCookie(event, REDIR_COOKIE) || '/';
//   const locale = getCookie(event, LOCALE_COOKIE) || undefined;
//   deleteCookie(event, STATE_COOKIE, { path: '/' });
//   deleteCookie(event, REDIR_COOKIE, { path: '/' });
//   return { state, redirect, locale };
// }
export function consumeOAuthCookies(event: any) {
  const state = getCookie(event, STATE_COOKIE);
  const raw = getCookie(event, REDIR_COOKIE);
  // Было: const redirect = getCookie(event, REDIR_COOKIE) || '/'
  const redirect = raw ? decodeURIComponent(raw) : '/';
  const locale = getCookie(event, LOCALE_COOKIE) || undefined;

  deleteCookie(event, STATE_COOKIE, { path: '/' });
  deleteCookie(event, REDIR_COOKIE, { path: '/' });
  return { state, redirect, locale };
}

export async function upsertUserWithOAuth(
  event: any,
  provider: Provider,
  profile: {
    providerUserId: string;
    email?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    locale?: string | null;
  },
  tokens?: { access_token?: string; refresh_token?: string; expires_at?: Date }
) {
  const acc = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, provider),
        eq(oauthAccounts.providerUserId, profile.providerUserId)
      )
    )
    .limit(1);

  let userId: number | null = null;
  if (acc.length) {
    userId = acc[0].userId as number;
    await db
      .update(oauthAccounts)
      .set({
        accessToken: tokens?.access_token ?? null,
        refreshToken: tokens?.refresh_token ?? null,
        expiresAt: tokens?.expires_at ?? null,
      })
      .where(eq(oauthAccounts.id, acc[0].id));
  } else {
    if (profile.email) {
      const u = await db
        .select()
        .from(users)
        .where(eq(users.email, profile.email))
        .limit(1);
      if (u.length) userId = u[0].id;
    }
    if (!userId) {
      const [u] = await db
        .insert(users)
        .values({
          email: profile.email ?? null,
          name: profile.name ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          locale: profile.locale ?? null,
        })
        .returning();
      userId = u.id;
    }
    await db.insert(oauthAccounts).values({
      userId: userId!,
      provider,
      providerUserId: profile.providerUserId,
      accessToken: tokens?.access_token ?? null,
      refreshToken: tokens?.refresh_token ?? null,
      expiresAt: tokens?.expires_at ?? null,
    });
  }
  await createSession(event, userId!, profile.locale ?? undefined);
  return userId!;
}

export async function postForm<T = any>(
  url: string,
  data: Record<string, string>
) {
  return await $fetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
  });
}

export function need(value?: any, code = 400, message = 'Bad request') {
  if (!value) throw createError({ statusCode: code, statusMessage: message });
  return value;
}
